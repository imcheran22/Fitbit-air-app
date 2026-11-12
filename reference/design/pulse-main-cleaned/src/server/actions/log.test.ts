import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RECONNECT, scopeUrl } from "@/lib/log";
import type { Config } from "../config";
import type { Db } from "../db";
import { loggedEntries, oauthTokens, profile } from "../db/schema";
import { freshDb, USER } from "../testing";
import { deleteLogEntry, logEntry } from "./log";

const h = vi.hoisted(() => ({ db: undefined as unknown, user: null as unknown, google: null as unknown, create: vi.fn(), requestSync: vi.fn() }));
vi.mock("../worker", () => ({ requestSync: h.requestSync }));
vi.mock("../auth", async (orig) => ({ ...(await orig<object>()), currentUser: async () => h.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../config", async (orig) => ({
  ...(await orig<object>()),
  getConfig: () => ({ dataSource: h.google ? "google" : "demo", google: h.google }) as unknown as Config,
}));
vi.mock("../db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));
vi.mock("../sources/google/client", () => ({ createGoogleClient: () => ({ create: h.create, batchDelete: vi.fn() }) }));

let db: Db;
const ME = { userId: USER, email: "me@example.com", name: "Me", username: "me", image: null };
const rows = () => db.select().from(loggedEntries);
const setSex = (sex: "male" | "female") =>
  db.insert(profile).values({ userId: USER, birthDate: "1990-01-01", sex, timeZone: "Asia/Kolkata", updatedAt: 0 }).onConflictDoUpdate({ target: profile.userId, set: { sex } });

beforeAll(async () => {
  db = h.db = await freshDb();
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-02T06:00:00Z") }); // 11:30 in Kolkata
});
afterAll(() => vi.useRealTimers());
beforeEach(async () => {
  await db.delete(loggedEntries);
  await db.delete(oauthTokens);
  h.user = ME;
  h.google = null;
  h.create.mockReset().mockResolvedValue("users/1/dataTypes/x/dataPoints/1");
  h.requestSync.mockClear();
  await setSex("male");
});

describe("logEntry", () => {
  it("needs a session", async () => {
    h.user = null;
    expect(await logEntry({ kind: "water", ml: 250 })).toMatchObject({ ok: false });
    expect(await rows()).toEqual([]);
  });

  it("demo: stores locally, never calls Google, and says it is demo", async () => {
    expect(await logEntry({ kind: "water", ml: 250 })).toEqual({ ok: true, data: { demo: true } });
    expect(h.create).not.toHaveBeenCalled();
    expect(await rows()).toMatchObject([{ type: "hydration-log", day: "2026-10-02", data: { ml: 250 }, googleName: null }]);
  });

  it("validates input, the time, and writes weight and body fat as two points", async () => {
    expect(await logEntry({ kind: "water", ml: 0 })).toEqual({ ok: false, error: "At least 10 ml" });
    expect(await logEntry({ kind: "mood", moods: [], valence: null })).toEqual({ ok: false, error: "Choose how you feel" });
    expect(await logEntry({ kind: "weight", kg: 72.44, fatPct: null, at: "2026-10-02T12:00" })).toEqual({ ok: false, error: "Can’t log the future" });
    expect(await logEntry({ kind: "weight", kg: 72.44, fatPct: 18.26, at: "2026-10-02T08:00" })).toMatchObject({ ok: true });
    expect((await rows()).map((r) => [r.type, r.data, r.ts])).toEqual([
      ["weight", { kg: 72.4 }, Date.parse("2026-10-02T02:30:00Z") / 1000],
      ["body-fat", { pct: 18.3 }, Date.parse("2026-10-02T02:30:00Z") / 1000],
    ]);
  });

  it("refuses cycle logging and cycle symptoms on a male profile, allows them on a female one", async () => {
    const period = { kind: "period", start: "2026-09-29", end: "2026-10-01", flow: "LIGHT" } as const;
    expect(await logEntry(period)).toEqual({ ok: false, error: "Not available for this profile" });
    expect(await logEntry({ kind: "ovulation", result: "POSITIVE" })).toMatchObject({ ok: false });
    expect(await logEntry({ kind: "symptoms", symptoms: ["CRAMPS"] })).toMatchObject({ ok: false });
    expect(await rows()).toEqual([]);
    await setSex("female");
    expect(await logEntry(period)).toMatchObject({ ok: true });
    expect(await logEntry({ kind: "period", start: "2026-10-01", end: "2026-09-30", flow: null })).toEqual({ ok: false, error: "The last day is before the first" });
    expect((await rows()).map((r) => r.type)).toEqual(["menstrual-period"]);
  });

  it("Google: a grant without the write scope asks for a reconnect before calling Google", async () => {
    h.google = { clientId: "c", clientSecret: "s" };
    await db.insert(oauthTokens).values({ userId: USER, accessToken: "a", refreshToken: "r", expiresAt: 0, scope: scopeUrl("hydration-log"), updatedAt: 0 });
    expect(await logEntry({ kind: "mood", moods: ["CALM"], valence: null })).toEqual({ ok: false, error: RECONNECT });
    expect(h.create).not.toHaveBeenCalled();
    // Water only needs nutrition.writeonly, which older grants have: it goes to Google and asks the sync for the total.
    expect(await logEntry({ kind: "water", ml: 500 })).toEqual({ ok: true, data: { demo: false } });
    expect(h.create).toHaveBeenCalledWith("hydration-log", expect.objectContaining({ hydrationLog: expect.anything() }));
    expect((await rows())[0].googleName).toBe("users/1/dataTypes/x/dataPoints/1");
    expect(h.requestSync).toHaveBeenCalledWith({ userId: USER, force: true });
  });
});

describe("deleteLogEntry", () => {
  it("needs a session and a valid id, then deletes", async () => {
    await logEntry({ kind: "water", ml: 250 });
    const { id } = (await rows())[0];
    expect(await deleteLogEntry({ id: "nope" })).toMatchObject({ ok: false });
    h.user = null;
    expect(await deleteLogEntry({ id })).toMatchObject({ ok: false });
    h.user = ME;
    expect(await deleteLogEntry({ id })).toEqual({ ok: true, data: undefined });
    expect(await rows()).toEqual([]);
  });
});
