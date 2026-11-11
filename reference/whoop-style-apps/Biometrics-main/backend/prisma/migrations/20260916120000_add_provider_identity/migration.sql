-- Identity is keyed on (authProvider, providerUserId) rather than on email alone.
-- Google and Apple sign-in are deliberately separate accounts even when they
-- share an email address; there is no cross-provider account linking.

-- DropIndex
-- Email can no longer be unique: one Apple account and one Google account may
-- legitimately share the same email address.
DROP INDEX "User_email_key";

-- AlterTable
-- Added nullable first so pre-existing rows can be backfilled, then tightened to
-- NOT NULL. Pre-existing rows are backfilled from their own (unique) id, which
-- keeps the new compound unique constraint satisfiable.
ALTER TABLE "User" ADD COLUMN "providerUserId" TEXT;
UPDATE "User" SET "providerUserId" = "id" WHERE "providerUserId" IS NULL;
ALTER TABLE "User" ALTER COLUMN "providerUserId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_authProvider_providerUserId_key" ON "User"("authProvider", "providerUserId");

-- CreateIndex
-- A given Fitbit account maps to at most one app user.
CREATE UNIQUE INDEX "FitbitConnection_fitbitUserId_key" ON "FitbitConnection"("fitbitUserId");
