-- The Coach page's daily summary sentence (spec 2026-09-30 section 4), and the
-- message a memory proposal was made on (history shows its chip there).
-- Additive only.

-- CreateEnum
CREATE TYPE "CoachSummarySource" AS ENUM ('AI', 'TEMPLATE');

-- CreateTable
CREATE TABLE "CoachDaySummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "spans" JSONB NOT NULL,
    "source" "CoachSummarySource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachDaySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachDaySummary_userId_date_key" ON "CoachDaySummary"("userId", "date");

-- AddForeignKey
ALTER TABLE "CoachDaySummary" ADD CONSTRAINT "CoachDaySummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CoachMemory" ADD COLUMN "messageId" TEXT;

-- CreateIndex
CREATE INDEX "CoachMemory_messageId_idx" ON "CoachMemory"("messageId");

-- AddForeignKey
ALTER TABLE "CoachMemory" ADD CONSTRAINT "CoachMemory_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CoachMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
