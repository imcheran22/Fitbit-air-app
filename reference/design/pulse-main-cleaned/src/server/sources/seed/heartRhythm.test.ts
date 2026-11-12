import { describe, expect, it } from "vitest";
import { type Db, rows, sql } from "../../db";
import { DAY_S, dump, NOW, seeded } from "../../testing";

const kinds = async (db: Db) => (await rows<{ kind: string }>(db, sql`select kind from health_records order by ts`)).map((r) => r.kind);

describe("seedHeartRhythm", () => {
  it("is deterministic, and a later pull adds no duplicates", async () => {
    const a = await seeded([NOW], { compute: false });
    expect(await dump(a, "health_records")).toBe(await dump(await seeded([NOW], { compute: false }), "health_records"));
    expect(await kinds(a)).toEqual(["ecg", "irn", "ecg", "ecg"]);
    expect(await kinds(await seeded([NOW - 40 * DAY_S, NOW], { compute: false }))).toHaveLength(4);
    // Three full 180-day seeds on PGlite: about 10 s each when the whole suite runs in parallel.
  }, 120_000);
});
