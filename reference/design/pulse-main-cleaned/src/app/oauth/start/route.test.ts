import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import type { Db } from "@/server/db";
import { oauthTokens } from "@/server/db/schema";
import { consumeState, SCOPES } from "@/server/sources/google/oauth";
import { freshDb, USER } from "@/server/testing";
import { GET } from "./route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown, user: null as unknown }));
vi.mock("@/server/auth", async (orig) => ({ ...(await orig<object>()), requestUser: async () => h.user }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const env = {};
const google = { DATA_SOURCE: "google", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret" };
const start = (url = "http://192.168.1.10:3000/oauth/start") => GET(new NextRequest(url));
const location = (res: Response) => new URL(res.headers.get("location")!);

beforeEach(async () => {
  h.db = await freshDb();
  h.user = { userId: USER, email: "me@example.com", name: "Me", username: "me", image: null };
});

describe("GET /oauth/start", () => {
  it("is a 404 on a demo instance", async () => {
    h.cfg = parseConfig(env);
    expect((await start()).status).toBe(404);
  });

  it("needs a Pulse session: signed out goes to /login, nothing issued", async () => {
    h.cfg = parseConfig({ ...env, ...google });
    h.user = null;
    const res = await start();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://192.168.1.10:3000/login");
  });

  it("redirects to Google with offline access, consent (no grant yet) and a single-use state", async () => {
    h.cfg = parseConfig({ ...env, ...google });
    const res = await start();
    expect(res.status).toBe(302);
    const url = location(res);
    expect(url.host).toBe("accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("scope")).toMatch(/^openid email profile /);
    // No APP_URL: the redirect follows the host the request came in on.
    expect(url.searchParams.get("redirect_uri")).toBe("http://192.168.1.10:3000/oauth/callback");
    const state = url.searchParams.get("state");
    expect(consumeState(state, USER)).toBe(true);
    expect(consumeState(state, USER)).toBe(false);
    // Bound to the user who started it.
    expect(consumeState(location(await start()).searchParams.get("state"), USER + 1)).toBe(false);
  });

  it("APP_URL pins the redirect host", async () => {
    h.cfg = parseConfig({ ...env, ...google, APP_URL: "https://pulse.example.com" });
    expect(location(await start()).searchParams.get("redirect_uri")).toBe("https://pulse.example.com/oauth/callback");
  });

  it("a returning user with a working grant only picks the account; ?switch=1 always asks for consent", async () => {
    h.cfg = parseConfig({ ...env, ...google });
    await (h.db as Db).insert(oauthTokens).values({ userId: USER, accessToken: "a", refreshToken: "r", expiresAt: 1, scope: SCOPES.join(" "), updatedAt: 1 });
    expect(location(await start()).searchParams.get("prompt")).toBe("select_account");
    expect(location(await start("http://192.168.1.10:3000/oauth/start?switch=1")).searchParams.get("prompt")).toBe("consent");
  });

  it("a grant missing a newer scope asks for consent again", async () => {
    h.cfg = parseConfig({ ...env, ...google });
    await (h.db as Db).insert(oauthTokens).values({ userId: USER, accessToken: "a", refreshToken: "r", expiresAt: 1, scope: SCOPES.slice(0, 3).join(" "), updatedAt: 1 });
    expect(location(await start()).searchParams.get("prompt")).toBe("consent");
  });
});
