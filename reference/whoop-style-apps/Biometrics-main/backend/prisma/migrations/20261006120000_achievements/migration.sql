-- CreateEnum
CREATE TYPE "AchievementFamily" AS ENUM ('SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH');

-- CreateEnum
CREATE TYPE "GoalChangeKind" AS ENUM ('SLEEP_MINUTES', 'BEDTIME');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "achievementsSince" DATE;

-- AlterTable
ALTER TABLE "HabitCheckIn" ADD COLUMN "onTime" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "family" "AchievementFamily" NOT NULL,
    "level" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "earnedOn" DATE NOT NULL,
    "weekStart" DATE NOT NULL,
    "monthStart" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "celebratedAt" TIMESTAMP(3),

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Achievement_level_check" CHECK ("level" BETWEEN 1 AND 5)
);

-- CreateTable
CREATE TABLE "GoalChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "GoalChangeKind" NOT NULL,
    "sleepMinutes" INTEGER,
    "bedtime" TEXT,
    "effectiveOn" DATE NOT NULL,
    "resetsStreak" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Achievement_userId_celebratedAt_idx" ON "Achievement"("userId", "celebratedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_userId_family_level_key" ON "Achievement"("userId", "family", "level");

-- CreateIndex
CREATE UNIQUE INDEX "GoalChange_userId_kind_effectiveOn_key" ON "GoalChange"("userId", "kind", "effectiveOn");

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalChange" ADD CONSTRAINT "GoalChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
