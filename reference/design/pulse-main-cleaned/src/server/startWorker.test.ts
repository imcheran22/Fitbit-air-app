import { afterEach, expect, it, vi } from "vitest";

const pull = vi.fn<(userId: number) => Promise<{ changed: boolean }>>(async () => ({ changed: false }));
const ensureDemoUser = vi.fn(async () => 42);
vi.mock("./sources/seed/generate", () => ({ seedSource: { pull }, ensureDemoUser }));
vi.mock("./sources/google/sync", () => ({ googleSource: { pull: async () => ({ changed: false }) } }));
vi.mock("./pipeline", () => ({ recomputeIfNeeded: async () => {} }));
const ensureDefaultTags = vi.fn(async () => 0);
vi.mock("./db", () => ({ getDb: () => ({}), row: async () => undefined, sql: () => undefined }));
vi.mock("./journalTags", () => ({ ensureDefaultTags }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  delete (globalThis as { __pulseWorker?: unknown }).__pulseWorker;
});

it("startWorker() is a process-wide singleton that syncs only the demo user on a demo instance", async () => {
  vi.useFakeTimers();
  vi.stubEnv("DATA_SOURCE", "demo");
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const { startWorker } = await import("./worker");
  startWorker();
  startWorker();
  expect(info).toHaveBeenCalledTimes(1);
  expect(info).toHaveBeenCalledWith("[worker] started (source: seed)");
  await vi.advanceTimersByTimeAsync(0);
  expect(ensureDemoUser).toHaveBeenCalledTimes(1);
  expect(ensureDefaultTags).toHaveBeenCalledWith({}, 42);
  const w = (globalThis as { __pulseWorker?: { stateOf: (id: number) => { lastRunAt: number | null; lastError: string | null } } }).__pulseWorker!;
  // The mocked database never grants the lock, so the run is skipped cleanly: attempted, no error.
  expect(w.stateOf(42)).toMatchObject({ lastError: null });
  expect(w.stateOf(42).lastRunAt).not.toBeNull();
});
