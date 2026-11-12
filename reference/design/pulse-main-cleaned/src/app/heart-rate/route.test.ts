// The live heart-rate poll: the session check, the throttled pull before reading, `since` filtering, and only the
// caller's own samples.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import { saveProfile } from "@/server/profile";
import { writeSamples } from "@/server/samples";
import { addUser, freshDb, TZ, USER } from "@/server/testing";
import { GET } from "./route";

const h = vi.hoisted(() => ({ db: undefined as unknown, user: null as unknown, pull: vi.fn<(userId: number) => Promise<void>>(async () => {}) }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));
vi.mock("@/server/auth", async (orig) => ({ ...(await orig<object>()), requestUser: async () => h.user }));
vi.mock("@/server/worker", () => ({ pullHeartRate: h.pull }));

const NOW = Date.parse("2026-10-02T06:00:20Z");
const sec = (iso: string) => Date.parse(iso) / 1000;
const get = (query: string, signedIn = true) => {
  h.user = signedIn ? { userId: USER, email: "me@example.com", name: "Me", username: "me", image: null } : null;
  return GET(new NextRequest(`http://pulse:3000/heart-rate${query}`));
};

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const db = (h.db = await freshDb());
  await saveProfile(db, USER, { birthDate: "1990-01-01", sex: "male", maxHr: null, heightCm: null, timeZone: TZ });
  await writeSamples(db, "hr", USER, [
    { ts: sec("2026-10-02T05:57:10Z"), v: 60 },
    { ts: sec("2026-10-02T05:57:40Z"), v: 64 },
    { ts: sec("2026-10-02T05:59:05Z"), v: 70 },
  ]);
  const other = await addUser(db);
  await writeSamples(db, "hr", other, [{ ts: sec("2026-10-02T05:58:00Z"), v: 150 }]);
});
afterAll(() => vi.useRealTimers());

describe("GET /heart-rate", () => {
  it("refuses a request without a session (401) and pulls nothing", async () => {
    const res = await get(`?since=${NOW}`, false);
    expect(res.status).toBe(401);
    expect(h.pull).not.toHaveBeenCalled();
  });

  it("refuses a missing or unreadable since (400)", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?since=abc")).status).toBe(400);
  });

  it("pulls first, then answers minute means from since's minute to now, gaps as null, never another user's", async () => {
    const res = await get(`?since=${Date.parse("2026-10-02T05:57:40Z")}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(h.pull).toHaveBeenCalledWith(USER);
    expect(await res.json()).toEqual({
      points: [
        { t: Date.parse("2026-10-02T05:57:00Z"), v: 62 }, // the whole minute, re-read: (60 + 64) / 2
        { t: Date.parse("2026-10-02T05:58:00Z"), v: null }, // the other user's 150 is not here
        { t: Date.parse("2026-10-02T05:59:00Z"), v: 70 },
        { t: Date.parse("2026-10-02T06:00:00Z"), v: null }, // the current minute, no reading yet
      ],
      latest: { t: Date.parse("2026-10-02T05:59:05Z"), bpm: 70 },
    });
  });

  it("reads at most a day back, and a since in the future answers nothing new", async () => {
    const old = await (await get("?since=0")).json();
    expect(old.points[0].t).toBe(Date.parse("2026-10-01T06:01:00Z"));
    expect(old.points).toHaveLength(1440);
    expect(await (await get(`?since=${NOW + 3_600_000}`)).json()).toEqual({ points: [], latest: null });
  });
});
