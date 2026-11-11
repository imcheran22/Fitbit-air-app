-- Coach engine choice and consent scope (spec 2026-09-30 section 3). Additive
-- only: every existing user keeps the local engine and every existing consent
-- row is a LOCAL consent.

-- CreateEnum
CREATE TYPE "CoachConsentScope" AS ENUM ('LOCAL', 'HOSTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "coachEngine" "CoachEngine" NOT NULL DEFAULT 'LOCAL';

-- AlterTable
ALTER TABLE "CoachConsent" ADD COLUMN "scope" "CoachConsentScope" NOT NULL DEFAULT 'LOCAL';

-- CreateIndex
CREATE INDEX "CoachConsent_userId_scope_consentedAt_idx" ON "CoachConsent"("userId", "scope", "consentedAt");
