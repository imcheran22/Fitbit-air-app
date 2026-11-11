-- Snapshot of the recap headline as the sharer previewed it (spec 2026-10-07 social §4.2). Story frames read this,
-- never the live Recap.line, which data deletion or a late rebuild can rewrite.
ALTER TABLE "RecapShare" ADD COLUMN "line" TEXT NOT NULL DEFAULT '';
