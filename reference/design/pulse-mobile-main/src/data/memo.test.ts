import { describe, expect, it, vi } from "vitest";
import { emptyMetrics } from "./types";
import { MemoryStore } from "./memory";
import { memoStore } from "./memo";

describe("memoStore", () => {
  it("reads a whole table once per version, hands out copies, and passes writes through", async () => {
    const store = new MemoryStore();
    await store.upsertMetrics([emptyMetrics("2026-10-01")]);
    const spy = vi.spyOn(store, "allMetrics");
    let version = 0;
    const memo = memoStore(store, () => version);

    const a = await memo.allMetrics();
    const b = await memo.allMetrics();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);

    await memo.upsertMetrics([emptyMetrics("2026-10-02")]);
    expect(await memo.allMetrics()).toHaveLength(1);
    version++;
    expect(await memo.allMetrics()).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
