import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import type { Db } from "@/server/db";
import { oauthTokens, syncState } from "@/server/db/schema";
import { addUser, freshDb, USER } from "@/server/testing";
import { disconnectGoogle } from "./actions";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown, revalidate: vi.fn(), user: null as unknown }));
vi.mock("@/server/auth", async (orig) => ({ ...(await orig<object>()), currentUser: async () => h.user }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const live = parseConfig({ DATA_SOURCE: "google", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret" });
const me = { userId: USER, email: "me@example.com", name: "Me", username: "me", image: null };

let db: Db;
let other: number;
const tokens = () => db.select({ userId: oauthTokens.userId }).from(oauthTokens).orderBy(oauthTokens.userId);
const grant = (userId: number) => ({ userId, accessToken: "at", refreshToken: "rt", expiresAt: 1, scope: "s", updatedAt: 1 });

const fetchMock = vi.fn<typeof fetch>(async () => new Response("", { status: 200 }));

beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock);
  db = h.db = await freshDb();
  other = await addUser(db);
  await db.insert(oauthTokens).values([grant(USER), grant(other)]);
  await db.insert(syncState).values([
    { userId: USER, type: "steps", lastError: "401 auth_revoked" },
    { userId: other, type: "steps", lastError: "401 auth_revoked" },
  ]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("disconnectGoogle", () => {
  it("refuses a signed-out caller, and a demo instance, keeping the grant", async () => {
    h.cfg = live;
    h.user = null;
    expect(await disconnectGoogle()).toEqual({ ok: false, error: "Signed out. Sign in again." });
    h.user = me;
    h.cfg = parseConfig({});
    expect(await disconnectGoogle()).toEqual({ ok: false, error: "Google is not enabled" });
    expect(await tokens()).toHaveLength(2);
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it("revokes the user's grant at Google, forgets it (only theirs) and revalidates the app", async () => {
    h.cfg = live;
    h.user = me;
    expect(await disconnectGoogle()).toEqual({ ok: true, data: undefined });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://oauth2.googleapis.com/revoke");
    expect(await tokens()).toEqual([{ userId: other }]);
    expect(await db.select({ userId: syncState.userId, lastError: syncState.lastError }).from(syncState).orderBy(syncState.userId)).toEqual([
      { userId: USER, lastError: null },
      { userId: other, lastError: "401 auth_revoked" },
    ]);
    expect(h.revalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("keeps the grant when Google can't be reached, so Disconnect can be retried", async () => {
    h.cfg = live;
    h.user = me;
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await disconnectGoogle()).toEqual({ ok: false, error: "Couldn’t reach Google to remove access. Try again." });
    expect(await tokens()).toHaveLength(2);
  });
});
