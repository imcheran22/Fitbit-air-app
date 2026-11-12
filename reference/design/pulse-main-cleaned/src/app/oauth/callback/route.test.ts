import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import type { Db } from "@/server/db";
import { exercises, journalEntries, oauthTokens } from "@/server/db/schema";
import { createState } from "@/server/sources/google/oauth";
import { addUser, freshDb, USER } from "@/server/testing";
import { GET } from "./route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown, requestSync: vi.fn(), user: null as unknown }));
vi.mock("@/server/auth", async (orig) => ({ ...(await orig<object>()), requestUser: async () => h.user }));
vi.mock("@/server/worker", () => ({ requestSync: h.requestSync }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const env = {};
const googleEnv = { DATA_SOURCE: "google", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret" };
const live = parseConfig({ ...env, ...googleEnv, APP_URL: "https://pulse.example.com" });

const idToken = (email: string) =>
  ["{}", JSON.stringify({ aud: "cid", email, email_verified: true, picture: "https://lh3.googleusercontent.com/a/me" })].map((p) => Buffer.from(p).toString("base64url")).join(".") + ".sig";

let db: Db;
let tokenResponse: () => Response;
const fetchMock = vi.fn<typeof fetch>(async () => tokenResponse());
const errors = vi.spyOn(console, "error").mockImplementation(() => {});
const granted = (email = "fit@gmail.com") => () =>
  new Response(JSON.stringify({ access_token: "at-NEW", refresh_token: "rt-NEW", expires_in: 3600, id_token: idToken(email) }));

const call = (q: Record<string, string>) =>
  GET(new NextRequest(`http://pulse:3000/oauth/callback?${new URLSearchParams(q)}`));
const tokens = () => db.select().from(oauthTokens);
const row = async () => (await tokens())[0];
const state = () => createState(USER);
const SETTINGS = "https://pulse.example.com/settings?oauth=";

beforeEach(async () => {
  db = await freshDb();
  h.db = db;
  h.user = { userId: USER, email: "me@example.com", name: "Me", username: "me", image: null };
  h.cfg = live;
  tokenResponse = granted();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /oauth/callback", () => {
  it("is a 404 on a demo instance", async () => {
    h.cfg = parseConfig(env);
    expect((await call({ state: state(), code: "c" })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a missing, wrong, expired or reused state goes back to Settings as expired and touches nothing", async () => {
    const expired = async (q: Record<string, string>) => {
      const res = await call(q);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toMatch(/\/settings\?oauth=expired$/);
    };
    await expired({ code: "c" });
    await expired({ state: "forged", code: "c" });
    await expired({ state: createState(USER, Date.now() - 10 * 60_000 - 1), code: "c" });
    const s = state();
    expect((await call({ state: s, code: "c" })).headers.get("location")).toMatch(/oauth=connected$/);
    await expired({ state: s, code: "c" });
    // Another user's state.
    await expired({ state: createState(USER + 1), code: "c" });
    // One connect: the token exchange and the Google Health identity check.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("without a Pulse session: /login, no token request, nothing stored", async () => {
    h.user = null;
    const res = await call({ state: state(), code: "c" });
    expect(res.headers.get("location")).toBe("https://pulse.example.com/login");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await tokens()).toEqual([]);
  });

  it("stores the grant and the Google email, starts the import and lands on Settings; the session is untouched", async () => {
    const res = await call({ state: state(), code: "c0de" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${SETTINGS}connected`);
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.get("code")).toBe("c0de");
    expect(body.get("redirect_uri")).toBe("https://pulse.example.com/oauth/callback");
    expect(await tokens()).toMatchObject([
      { userId: USER, accessToken: "at-NEW", refreshToken: "rt-NEW", revokedAt: null, googleEmail: "fit@gmail.com", googlePicture: "https://lh3.googleusercontent.com/a/me" },
    ]);
    expect(h.requestSync).toHaveBeenCalledExactlyOnceWith({ userId: USER, force: true });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("without APP_URL, redirects go back to the host the request came in on", async () => {
    h.cfg = parseConfig({ ...env, ...googleEnv });
    const res = await call({ state: state(), code: "c" });
    expect(res.headers.get("location")).toBe("http://pulse:3000/settings?oauth=connected");
    expect(new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body)).get("redirect_uri")).toBe("http://pulse:3000/oauth/callback");
  });

  it("switching to another Google account clears the old account's synced data (this user's only) and keeps the journal", async () => {
    const other = await addUser(db);
    const ex = (userId: number) => ({ userId, id: "x", day: "2026-09-01", startTs: 1, endTs: 2, type: "WALKING", source: "google" });
    await db.insert(exercises).values([ex(USER), ex(other)]); // synced before the grant recorded an email: kept
    await call({ state: state(), code: "c" });
    expect(await db.select().from(exercises)).toHaveLength(2);
    await db.insert(journalEntries).values({ userId: USER, day: "2026-09-01", tag: "alcohol", value: 1 });
    await call({ state: state(), code: "c" }); // same account again: nothing cleared
    expect(await db.select().from(exercises)).toHaveLength(2);
    tokenResponse = granted("other@gmail.com");
    await call({ state: state(), code: "c" });
    expect(await db.select().from(exercises)).toMatchObject([{ userId: other }]);
    expect(await db.select().from(journalEntries)).toHaveLength(1);
    expect(await row()).toMatchObject({ googleEmail: "other@gmail.com", googlePicture: "https://lh3.googleusercontent.com/a/me" });
  });

  it("a token error lands on Settings with its code, never logging Google's detail", async () => {
    tokenResponse = () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "SECRET-DETAIL" }), { status: 400 });
    const bad = await call({ state: state(), code: "c" });
    expect(bad.headers.get("location")).toBe(`${SETTINGS}invalid_grant`);
    expect(errors.mock.calls.flat().join(" ")).not.toContain("SECRET-DETAIL");
  });

  it("no refresh_token and no working grant: auth_revoked, without logging the token", async () => {
    await db.insert(oauthTokens).values({ userId: USER, accessToken: "at-old", refreshToken: "rt-old", expiresAt: 1, scope: "s", updatedAt: 1, revokedAt: 1 });
    const before = await tokens();
    tokenResponse = () => new Response(JSON.stringify({ access_token: "at-NEW", expires_in: 3600, id_token: idToken("fit@gmail.com") }));
    const res = await call({ state: state(), code: "c" });
    expect(res.headers.get("location")).toBe(`${SETTINGS}auth_revoked`);
    expect(await tokens()).toEqual(before);
    expect(String(errors.mock.calls[0][0])).toContain("auth_revoked");
    expect(String(errors.mock.calls[0][0])).not.toContain("at-NEW");
  });

  it("an account without Google Health stores nothing", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/identity")
        ? new Response(JSON.stringify({ error: { details: [{ reason: "ACCOUNT_NOT_LINKED" }] } }), { status: 400 })
        : tokenResponse(),
    );
    const res = await call({ state: state(), code: "c" });
    expect(res.headers.get("location")).toBe(`${SETTINGS}account_not_linked`);
    expect(await tokens()).toEqual([]);
    fetchMock.mockImplementation(async () => tokenResponse());
  });

  it("a denied consent returns to Settings without a token request", async () => {
    const res = await call({ state: state(), error: "access_denied" });
    expect(res.headers.get("location")).toBe(`${SETTINGS}access_denied`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a network failure logs the error name only", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed at-SECRET"));
    const res = await call({ state: state(), code: "c" });
    expect(res.headers.get("location")).toBe(`${SETTINGS}error`);
    expect(errors.mock.calls.flat().join(" ")).toBe("[oauth] callback failed: TypeError");
  });
});
