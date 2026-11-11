-- CreateEnum
CREATE TYPE "SleepStageType" AS ENUM ('AWAKE', 'LIGHT', 'DEEP', 'REM');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bedtimeGoal" TEXT,
ADD COLUMN     "wakeGoal" TEXT;

-- AlterTable
ALTER TABLE "HealthConnection" ADD COLUMN     "sleepStagesBackfilledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SleepSession" ADD COLUMN     "awakeMinutes" DOUBLE PRECISION,
ADD COLUMN     "deepMinutes" DOUBLE PRECISION,
ADD COLUMN     "lightMinutes" DOUBLE PRECISION,
ADD COLUMN     "mainSleep" BOOLEAN,
ADD COLUMN     "minutesAfterWakeUp" DOUBLE PRECISION,
ADD COLUMN     "minutesAwake" DOUBLE PRECISION,
ADD COLUMN     "minutesInSleepPeriod" DOUBLE PRECISION,
ADD COLUMN     "minutesToFallAsleep" DOUBLE PRECISION,
ADD COLUMN     "remMinutes" DOUBLE PRECISION,
ADD COLUMN     "sleepType" TEXT;

-- CreateTable
CREATE TABLE "SleepStage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "SleepStageType" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SleepStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SleepStage_sessionId_startTime_idx" ON "SleepStage"("sessionId", "startTime");

-- AddForeignKey
ALTER TABLE "SleepStage" ADD CONSTRAINT "SleepStage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SleepSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
