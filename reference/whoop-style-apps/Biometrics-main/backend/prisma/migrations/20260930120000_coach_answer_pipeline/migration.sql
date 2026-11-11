-- Coach answer pipeline (spec 2026-09-30, section 5). Additive only: existing
-- rows keep null in every new column and render as plain talk.

-- CreateEnum
CREATE TYPE "CoachEngine" AS ENUM ('LOCAL', 'HOSTED');

-- AlterTable
ALTER TABLE "CoachMessage" ADD COLUMN     "card" JSONB,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "engine" "CoachEngine";
