-- CreateEnum
CREATE TYPE "RecapKind" AS ENUM ('WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "RecapStatus" AS ENUM ('BUILT', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RecapTextSource" AS ENUM ('AI', 'TEMPLATE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recapPushEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Recap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "RecapKind" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "RecapStatus" NOT NULL,
    "stats" JSONB,
    "sleepGoalMinutes" INTEGER NOT NULL,
    "line" TEXT,
    "lineSource" "RecapTextSource",
    "story" TEXT,
    "storySource" "RecapTextSource",
    "personaId" TEXT,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rebuiltAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "pushedAt" TIMESTAMP(3),

    CONSTRAINT "Recap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recap_userId_status_periodEnd_idx" ON "Recap"("userId", "status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Recap_userId_kind_periodStart_key" ON "Recap"("userId", "kind", "periodStart");

-- AddForeignKey
ALTER TABLE "Recap" ADD CONSTRAINT "Recap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
