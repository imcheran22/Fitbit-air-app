// Builds the pinned 180-day demo database (seeded and recomputed) once, before any test file runs, and saves its
// PGlite data directory; seeded() with default arguments restores it instead of seeding its own. The snapshot is
// cached under node_modules/.cache, keyed by every non-test source file and migration.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    seedDb: string;
  }
}

export default async function setup(project: TestProject) {
  const hash = crypto.createHash("sha256").update(process.version);
  for (const f of fs.globSync("{src/**/*.ts,drizzle/**/*}").filter((f) => !f.endsWith(".test.ts")).sort()) {
    if (fs.statSync(f).isFile()) hash.update(f).update(fs.readFileSync(f));
  }
  const dir = path.resolve("node_modules/.cache/pulse-test");
  const file = path.join(dir, `seed-${hash.digest("hex").slice(0, 16)}.tar.gz`);
  if (!fs.existsSync(file)) {
    fs.rmSync(dir, { recursive: true, force: true }); // older builds
    fs.mkdirSync(dir, { recursive: true });
    const { buildSeeded, snapshotOf } = await import("./src/server/testing");
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, await snapshotOf(await buildSeeded(undefined, { install: false })));
      fs.renameSync(tmp, file);
    } catch (e) {
      // A broken seed or pipeline must fail the tests that use it, not abort the run: seeded() builds its own.
      console.warn(`[global-setup] no shared seed database: ${e instanceof Error ? e.message : e}`);
      return;
    }
  }
  project.provide("seedDb", file);
}
