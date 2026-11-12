import { beforeEach, describe, expect, it, vi } from "vitest";
import { scopeUrl } from "@/lib/log";
import type { Db } from "./db";
import { dailyValues, loggedEntries, oauthTokens, syncState } from "./db/schema";
import { deleteEntry, entriesOn, IMPORT_GRACE_S, importEntries, logAccess, PRUNE_CHECKS, pruneEntries, entriesOnDay, rewindSync, saveEntries, totalsBetween, waterOn, type LogWriter, type PointCheck } from "./log";
import type { MappedEntry } from "./sources/google/map";
import { GoogleError } from "./sources/google/oauth";
import { addUser, freshDb, USER } from "./testing";

const TZ = "Asia/Kolkata";
const T = Date.parse("2026-10-02T06:00:00Z") / 1000; // Oct 2, 11:30 local
const NAME = "users/1/dataTypes/moods/dataPoints/p1";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const fake = (o: Partial<LogWriter> = {}) => ({ create: vi.fn(async () => NAME), batchDelete: vi.fn(async () => {}), exists: vi.fn(async () => true), ...o }) satisfies LogWriter;
const grant = (scopes: string[], revokedAt: number | null = null) =>
  db.insert(oauthTokens).values({ userId: USER, accessToken: "a", refreshToken: "r", expiresAt: T + 3600, scope: scopes.join(" "), revokedAt, updatedAt: T });
const all = () => db.select().from(loggedEntries);

describe("logAccess", () => {
  it("demo everywhere in demo mode; not connected without a grant", async () => {
    expect((await logAccess(db, USER, "demo")).moods).toBe("demo");
    expect((await logAccess(db, USER, "google")).moods).toBe("not_connected");
  });

  it("an older grant writes water and food (nutrition.writeonly) but needs a reconnect for the rest", async () => {
    await grant([scopeUrl("hydration-log")]);
    const a = await logAccess(db, USER, "google");
    expect([a["hydration-log"], a["nutrition-log"], a.weight, a.moods, a.symptoms, a["menstrual-period"]]).toEqual(["ok", "ok", "reconnect", "reconnect", "reconnect", "reconnect"]);
  });

  it("a revoked grant needs a reconnect", async () => {
    await grant([scopeUrl("moods")], T);
    expect((await logAccess(db, USER, "google")).moods).toBe("reconnect");
  });
});

describe("saveEntries / deleteEntry", () => {
  it("writes to Google, stores the name, and deletes at Google then here", async () => {
    const w = fake();
    expect(await saveEntries(db, USER, [{ type: "moods", ts: T, data: { moods: ["CALM"], valence: "PLEASANT" } }], { tz: TZ, writer: w, now: T })).toEqual({ ok: true });
    expect(w.create).toHaveBeenCalledWith("moods", { moods: expect.objectContaining({ moods: ["CALM"], valences: ["PLEASANT"] }) });
    const [row] = await all();
    expect(row).toMatchObject({ type: "moods", ts: T, day: "2026-10-02", googleName: NAME, data: { moods: ["CALM"], valence: "PLEASANT" } });

    expect(await deleteEntry(db, USER, row.id, w)).toEqual({ ok: true, type: "moods", day: "2026-10-02" });
    expect(w.batchDelete).toHaveBeenCalledWith("moods", [NAME]);
    expect(await all()).toEqual([]);
  });

  it("demo (no writer) keeps entries locally only", async () => {
    await saveEntries(db, USER, [{ type: "symptoms", ts: T, data: { symptoms: ["HEADACHE"] } }], { tz: TZ, writer: null, now: T });
    expect((await all())[0].googleName).toBeNull();
    expect(await entriesOnDay(db, USER, "2026-10-02")).toMatchObject([{ type: "symptoms", title: "Symptoms", detail: "Headache", atGoogle: false }]);
  });

  it("a 403 asks for a reconnect and stores nothing; other Google errors fail softly", async () => {
    const denied = fake({ create: vi.fn(async () => Promise.reject(new GoogleError("PERMISSION_DENIED", 403))) });
    expect(await saveEntries(db, USER, [{ type: "moods", ts: T, data: { moods: ["SAD"], valence: null } }], { tz: TZ, writer: denied, now: T })).toEqual({
      ok: false,
      reason: "reconnect",
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = fake({ create: vi.fn(async () => Promise.reject(new GoogleError("http_503", 503))) });
    expect(await saveEntries(db, USER, [{ type: "moods", ts: T, data: { moods: ["SAD"], valence: null } }], { tz: TZ, writer: down, now: T })).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(await all()).toEqual([]);
  });

  it("a delete Google no longer knows still deletes here; a failing one keeps the row", async () => {
    await saveEntries(db, USER, [{ type: "moods", ts: T, data: { moods: ["SAD"], valence: null } }], { tz: TZ, writer: fake(), now: T });
    const id = (await all())[0].id;
    const denied = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("PERMISSION_DENIED", 403))) });
    expect(await deleteEntry(db, USER, id, denied)).toEqual({ ok: false, reason: "reconnect" });
    expect(await all()).toHaveLength(1);
    const gone = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("NOT_FOUND", 404))) });
    expect(await deleteEntry(db, USER, id, gone)).toEqual({ ok: true, type: "moods", day: "2026-10-02" });
    expect(await all()).toEqual([]);
  });
});

describe("waterOn", () => {
  it("counts an entry once: pending until the hydration sync, then in Google's roll-up only", async () => {
    await saveEntries(db, USER, [{ type: "hydration-log", ts: T, data: { ml: 250 } }], { tz: TZ, writer: null, now: T });
    expect(await waterOn(db, USER, "2026-10-02")).toBe(250); // nothing synced yet
    await db.insert(dailyValues).values({ userId: USER, day: "2026-10-02", key: "water", value: 1250 }); // includes the 250
    await db.insert(syncState).values({ userId: USER, type: "hydration-log", lastSuccessAt: T + 60 });
    expect(await waterOn(db, USER, "2026-10-02")).toBe(1250);
    await saveEntries(db, USER, [{ type: "hydration-log", ts: T + 120, data: { ml: 500 } }], { tz: TZ, writer: null, now: T + 120 });
    expect(await waterOn(db, USER, "2026-10-02")).toBe(1750);
    expect(await waterOn(db, USER, "2026-10-01")).toBe(0);
  });
});

describe("importEntries", () => {
  const WIN: { from: number; to: number; now: number; check: PointCheck } = { from: T - 14 * 86_400, to: T + 3600, now: T + 3600, check: async () => false };
  /** One sync's worth: import, then prune what Google confirms gone. */
  const run = async (type: Parameters<typeof importEntries>[2], entries: MappedEntry[], complete = true, o = WIN) => {
    const r = await importEntries(db, USER, type, { entries, complete }, o);
    const p = await pruneEntries(db, USER, r.missing, o.check);
    if (p.error) throw p.error;
    return r.changed || p.deleted > 0;
  };
  const pt = (id: string, ts: number, ml: number): MappedEntry => ({ name: `users/9/dataTypes/hydration-log/dataPoints/${id}`, ts, day: "2026-10-02", data: { ml } });
  const water = (entries: MappedEntry[], complete = true, o = WIN) => run("hydration-log", entries, complete, o);

  it("brings another app's entries home as google entries, once", async () => {
    expect(await water([pt("a", T, 300)])).toBe(true);
    expect(await water([pt("a", T, 300)])).toBe(false);
    expect(await all()).toMatchObject([{ type: "hydration-log", ts: T, day: "2026-10-02", data: { ml: 300 }, source: "google", googleName: expect.stringContaining("/a") }]);
    expect(await entriesOnDay(db, USER, "2026-10-02")).toMatchObject([{ title: "Water", detail: "300 ml", atGoogle: true, app: "Another app" }]);
  });

  it("matches Pulse's own entries by point id whatever the user part of the name, and takes Google's edits", async () => {
    await saveEntries(db, USER, [{ type: "hydration-log", ts: T, data: { ml: 250 } }], { tz: TZ, writer: fake({ create: vi.fn(async () => "users/me/dataTypes/hydration-log/dataPoints/a") }), now: T });
    expect(await water([pt("a", T, 250)])).toBe(false);
    expect(await water([pt("a", T + 60, 500)])).toBe(true);
    expect(await all()).toMatchObject([{ ts: T + 60, data: { ml: 500 }, source: "pulse" }]);
  });

  it("names a Pulse entry whose write did not report a name, instead of importing it twice", async () => {
    await saveEntries(db, USER, [{ type: "hydration-log", ts: T, data: { ml: 250 } }], { tz: TZ, writer: fake({ create: vi.fn(async () => null) as never }), now: T });
    await water([pt("a", T, 250)]);
    expect(await all()).toMatchObject([{ source: "pulse", googleName: expect.stringContaining("/a") }]);
  });

  it("deletes what Google no longer returns, but not a fresh write, an unnamed entry or after an unreadable page", async () => {
    await water([pt("a", T, 300), pt("b", T + 1, 400)]);
    await saveEntries(db, USER, [{ type: "hydration-log", ts: T + 2, data: { ml: 100 } }], { tz: TZ, writer: fake({ create: vi.fn(async () => "users/me/dataTypes/hydration-log/dataPoints/c") }), now: WIN.now - 60 });
    await saveEntries(db, USER, [{ type: "hydration-log", ts: T + 3, data: { ml: 50 } }], { tz: TZ, writer: null, now: T });
    expect(await water([pt("a", T, 300)], false)).toBe(false);
    expect(await all()).toHaveLength(4);
    expect(await water([pt("a", T, 300)])).toBe(true);
    expect((await all()).map((r) => (r.data as { ml: number }).ml).sort((x, y) => x - y)).toEqual([50, 100, 300]);
    await water([pt("a", T, 300)], true, { ...WIN, now: WIN.now + IMPORT_GRACE_S });
    expect((await all()).map((r) => (r.data as { ml: number }).ml).sort((x, y) => x - y)).toEqual([50, 300]);
  });

  it("keeps a missing entry Google still answers for: a short page never clears the log", async () => {
    await water([pt("a", T, 300), pt("b", T + 1, 400)]);
    const check = vi.fn(async () => true);
    expect(await water([], true, { ...WIN, check })).toBe(false);
    expect(check).toHaveBeenCalledTimes(2);
    expect(await all()).toHaveLength(2);
  });

  it("a read-back error keeps the entry, never blocks new ones, and is reported", async () => {
    await water([pt("a", T, 300)]);
    const failing = async () => Promise.reject(new GoogleError("http_503", 503));
    const r = await importEntries(db, USER, "hydration-log", { entries: [pt("b", T + 1, 400)], complete: true }, WIN);
    expect(await pruneEntries(db, USER, r.missing, failing)).toMatchObject({ deleted: 0, error: expect.any(GoogleError) });
    expect(await all()).toHaveLength(2);
  });

  it("spends at most PRUNE_CHECKS read-backs a run", async () => {
    await water(Array.from({ length: PRUNE_CHECKS + 5 }, (_, i) => pt(`m${i}`, T - i, 100)));
    const check = vi.fn(async () => false);
    await water([], true, { ...WIN, check });
    expect(check).toHaveBeenCalledTimes(PRUNE_CHECKS);
    expect(await all()).toHaveLength(5);
  });

  it("takes an optional 0 g that Google drops as the same food", async () => {
    const food = (fat: number | null): MappedEntry => ({ name: "users/9/dataTypes/nutrition-log/dataPoints/f", ts: T, day: "2026-10-02", data: { name: "Tea", meal: "SNACK", kcal: 30, protein: null, carbs: 7, fat } });
    await saveEntries(db, USER, [{ type: "nutrition-log", ts: T, data: food(0).data }], { tz: TZ, writer: fake({ create: vi.fn(async () => food(0).name) }), now: T });
    expect(await run("nutrition-log", [food(null)])).toBe(false);
    expect(await run("nutrition-log", [food(2)])).toBe(true);
  });

  it("moves an entry to its new local day", async () => {
    await water([pt("a", T, 300)]);
    await water([{ ...pt("a", T, 300), day: "2026-10-01" }]);
    expect((await all())[0].day).toBe("2026-10-01");
  });

  it("lists one type's entries on a day, however many there are", async () => {
    await water(Array.from({ length: 60 }, (_, i) => pt(`p${i}`, T - i * 60, 100)));
    await water([{ ...pt("y", T - 86_400, 100), day: "2026-10-01" }], false);
    const on = await entriesOn(db, USER, "hydration-log", "2026-10-02");
    expect(on).toHaveLength(60);
    expect(on[0].ts).toBe(T - 59 * 60);
    expect(on[0].fromApp).toBe(true);
  });

  it("only touches its own user", async () => {
    const other = await addUser(db);
    await saveEntries(db, other, [{ type: "hydration-log", ts: T, data: { ml: 300 } }], { tz: TZ, writer: fake({ create: vi.fn(async () => "users/9/dataTypes/hydration-log/dataPoints/z") }), now: T - 3600 });
    await water([]);
    expect(await all()).toHaveLength(1);
  });

  it("leaves entries outside the window and other types alone", async () => {
    await water([pt("old", T - 20 * 86_400, 300)], true, { ...WIN, from: T - 30 * 86_400 });
    await saveEntries(db, USER, [{ type: "moods", ts: T, data: { moods: ["CALM"], valence: null } }], { tz: TZ, writer: fake(), now: T - 3600 });
    await water([]);
    expect((await all()).map((r) => r.type).sort()).toEqual(["hydration-log", "moods"]);
  });

  it("an imported drink is never counted as pending water", async () => {
    await water([pt("a", T, 300)]);
    expect(await waterOn(db, USER, "2026-10-02")).toBe(0);
  });

  it("deleting another app's entry Google refuses (403 or 404) says where to delete it and keeps it", async () => {
    await grant([scopeUrl("hydration-log")]);
    await water([pt("a", T, 300)]);
    const id = (await all())[0].id;
    for (const status of [403, 404]) {
      const refused = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("x", status))) });
      expect(await deleteEntry(db, USER, id, refused)).toEqual({ ok: false, reason: "foreign" });
    }
    expect(await all()).toHaveLength(1);
    // Already deleted in that app: a 404 that Google cannot read back either is deleted here too.
    const gone = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("x", 404))), exists: vi.fn(async () => false) });
    expect(await deleteEntry(db, USER, id, gone)).toEqual({ ok: true, type: "hydration-log", day: "2026-10-02" });
    expect(await all()).toEqual([]);
  });

  it("deleting another app's entry without the write scope asks for a reconnect, before calling Google", async () => {
    await grant([scopeUrl("hydration-log")]);
    await run("weight", [{ name: "users/9/dataTypes/weight/dataPoints/w", ts: T, day: "2026-10-02", data: { kg: 70 } }]);
    const w = fake();
    expect(await deleteEntry(db, USER, (await all())[0].id, w)).toEqual({ ok: false, reason: "reconnect" });
    expect(w.batchDelete).not.toHaveBeenCalled();
  });

  it("a 403 on Pulse's own entry still asks for a reconnect", async () => {
    await saveEntries(db, USER, [{ type: "hydration-log", ts: T, data: { ml: 250 } }], { tz: TZ, writer: fake(), now: T });
    const denied = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("PERMISSION_DENIED", 403))) });
    expect(await deleteEntry(db, USER, (await all())[0].id, denied)).toEqual({ ok: false, reason: "reconnect" });
  });
});

describe("rewindSync and totalsBetween", () => {
  it("moves a synced type's cursor back to the day, never forward, and leaves an unsynced type alone", async () => {
    await db.insert(syncState).values([
      { userId: USER, type: "hydration-log", syncedThrough: T },
      { userId: USER, type: "weight", syncedThrough: null },
    ]);
    await rewindSync(db, USER, "hydration-log", "2026-09-20", TZ);
    await rewindSync(db, USER, "hydration-log", "2026-09-25", TZ);
    await rewindSync(db, USER, "weight", "2026-09-20", TZ);
    const s = Object.fromEntries((await db.select().from(syncState)).map((r) => [r.type, r.syncedThrough]));
    expect(s).toEqual({ "hydration-log": Date.parse("2026-09-20T00:00:00+05:30") / 1000, weight: null });
  });

  it("totals each day as waterOn does: roll-up plus pending Pulse entries, null for a day with nothing", async () => {
    await saveEntries(db, USER, [{ type: "hydration-log", ts: T, data: { ml: 250 } }, { type: "nutrition-log", ts: T, data: { name: null, meal: "SNACK", kcal: 100, protein: null, carbs: null, fat: null } }], { tz: TZ, writer: null, now: T });
    await db.insert(dailyValues).values([{ userId: USER, day: "2026-10-01", key: "water", value: 900 }]);
    expect(await totalsBetween(db, USER, "2026-09-30", "2026-10-02")).toEqual([
      { day: "2026-09-30", water: null, kcal: null },
      { day: "2026-10-01", water: 900, kcal: null },
      { day: "2026-10-02", water: 250, kcal: 100 },
    ]);
    expect((await totalsBetween(db, USER, "2026-10-02", "2026-10-02"))[0].water).toBe(await waterOn(db, USER, "2026-10-02"));
    await db.insert(syncState).values({ userId: USER, type: "nutrition-log", lastSuccessAt: T + 60 });
    expect((await totalsBetween(db, USER, "2026-10-02", "2026-10-02"))[0].kcal).toBeNull(); // synced: the roll-up owns it
  });
});

describe("per user", () => {
  it("another user's entries are invisible and undeletable", async () => {
    const other = await addUser(db);
    await saveEntries(db, other, [{ type: "hydration-log", ts: T, data: { ml: 300 } }], { tz: TZ, writer: null, now: T });
    expect(await entriesOnDay(db, USER, "2026-10-02")).toEqual([]);
    expect(await waterOn(db, USER, "2026-10-02")).toBe(0);
    const id = (await all())[0].id;
    await deleteEntry(db, USER, id, null);
    expect(await all()).toHaveLength(1);
  });
});
