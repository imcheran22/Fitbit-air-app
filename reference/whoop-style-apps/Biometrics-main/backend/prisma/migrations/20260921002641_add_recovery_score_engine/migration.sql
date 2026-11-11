-- CreateEnum
CREATE TYPE "ScoreType" AS ENUM ('RECOVERY', 'SLEEP');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ScoreInputFlagType" AS ENUM ('OUTLIER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sleepGoalMinutes" INTEGER NOT NULL DEFAULT 480;

-- CreateTable
CREATE TABLE "BaselineSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "ewma" DOUBLE PRECISION,
    "spread" DOUBLE PRECISION,
    "mad" DOUBLE PRECISION,
    "daysOfHistory" INTEGER NOT NULL,
    "algorithmVersion" TEXT NOT NULL,

    CONSTRAINT "BaselineSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDailyFeatures" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "sleepDebtRolling14d" DOUBLE PRECISION,
    "hrvBaselineDeviationPct" DOUBLE PRECISION,
    "rhrBaselineDeviationPct" DOUBLE PRECISION,
    "acuteChronicLoadRatio" DOUBLE PRECISION,
    "hrvZ" DOUBLE PRECISION,
    "hrvZImputed" BOOLEAN NOT NULL DEFAULT false,
    "rhrZ" DOUBLE PRECISION,
    "rhrZImputed" BOOLEAN NOT NULL DEFAULT false,
    "sleepDurationZ" DOUBLE PRECISION,
    "sleepDurationZImputed" BOOLEAN NOT NULL DEFAULT false,
    "sleepEfficiency" DOUBLE PRECISION,
    "sleepEfficiencyZ" DOUBLE PRECISION,
    "sleepEfficiencyZImputed" BOOLEAN NOT NULL DEFAULT false,
    "circadianConsistencyScore" DOUBLE PRECISION,
    "circadianConsistencyZ" DOUBLE PRECISION,
    "circadianConsistencyZImputed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDailyFeatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "ScoreType" NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "confidenceLevel" "ConfidenceLevel" NOT NULL,
    "factors" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreInputFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "flag" "ScoreInputFlagType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "median" DOUBLE PRECISION NOT NULL,
    "mad" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreInputFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BaselineSnapshot_userId_date_idx" ON "BaselineSnapshot"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BaselineSnapshot_userId_metric_date_key" ON "BaselineSnapshot"("userId", "metric", "date");

-- CreateIndex
CREATE UNIQUE INDEX "UserDailyFeatures_userId_date_key" ON "UserDailyFeatures"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyScore_userId_date_idx" ON "DailyScore"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyScore_userId_date_type_key" ON "DailyScore"("userId", "date", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreInputFlag_userId_metric_date_flag_key" ON "ScoreInputFlag"("userId", "metric", "date", "flag");

-- AddForeignKey
ALTER TABLE "BaselineSnapshot" ADD CONSTRAINT "BaselineSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDailyFeatures" ADD CONSTRAINT "UserDailyFeatures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyScore" ADD CONSTRAINT "DailyScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreInputFlag" ADD CONSTRAINT "ScoreInputFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
