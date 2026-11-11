// HRV samples on the in-memory store, and the demo seed's 5-minute nights (the Pulse engine's Recovery input).
import { describe, expect, it } from "vitest";
import { contextAt, isSleep, timeline } from "@/core/engine/context";
import { addDays } from "@/lib/time";
import { openMemoryStore } from "./memory";
import { seedDemo } from "./seed";

const TZ = "Asia/Kolkata";

describe("HRV samples", () => {
  it("round-trip by ts, half-open reads, and clearImported drops them", async () => {
    const store = await openMemoryStore();
    await store.putHrv([{ ts: 300, ms: 40 }, { ts: 0, ms: 38 }, { ts: 600, ms: 41 }]);
    await store.putHrv([{ ts: 300, ms: 42 }]);
    expect(await store.readHrv(0, 600)).toEqual([{ ts: 0, ms: 38 }, { ts: 300, ms: 42 }]);
    await store.clearImported({ from: "1970-01-01", to: "1970-01-01" }, 0, 301);
    expect(await store.readHrv(0, 1000)).toEqual([{ ts: 600, ms: 41 }]);
  });

  it("the seed writes a sample every 5 minutes through each night, almost all of them in sleep stages", async () => {
    const store = await openMemoryStore();
    const today = "2026-10-10";
    await seedDemo(store, { today, timeZone: TZ, days: 10 });
    const sessions = (await store.allSessions()).filter((s) => s.isMain && s.day === addDays(today, -1));
    expect(sessions).toHaveLength(1);
    const [night] = sessions;
    const samples = await store.readHrv(night.startTs, night.endTs);
    expect(samples.length).toBe(Math.ceil((night.endTs - night.startTs) / 300));
    const tl = timeline({ sessions, segments: await store.segmentsFor([night.id]), workouts: [] });
    const asleep = samples.filter((s) => isSleep(contextAt(tl, s.ts, false)));
    expect(asleep.length / samples.length).toBeGreaterThan(0.8);
  });
});
