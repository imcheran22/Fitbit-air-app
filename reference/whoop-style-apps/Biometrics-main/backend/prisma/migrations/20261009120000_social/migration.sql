-- Social tab S1 (spec docs/superpowers/specs/2026-10-07-social-tab-design.md). Additive only.

-- CreateEnum
CREATE TYPE "CheckInMood" AS ENUM ('RESTED', 'OKAY', 'TIRED');

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "mood" "CheckInMood" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorySeen" (
    "viewerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StorySeen_pkey" PRIMARY KEY ("viewerId","authorId","localDate")
);

-- CreateTable
CREATE TABLE "RecapShare" (
    "id" TEXT NOT NULL,
    "sharerId" TEXT NOT NULL,
    "recapId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecapShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepGoalEvent" (
    "authorId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StepGoalEvent_pkey" PRIMARY KEY ("authorId","localDate")
);

-- CreateTable
CREATE TABLE "WeeklyHighlights" (
    "viewerId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "items" JSONB NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeeklyHighlights_pkey" PRIMARY KEY ("viewerId","weekStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_authorId_localDate_key" ON "CheckIn"("authorId", "localDate");
CREATE INDEX "CheckIn_localDate_idx" ON "CheckIn"("localDate");
CREATE UNIQUE INDEX "RecapShare_sharerId_recapId_key" ON "RecapShare"("sharerId", "recapId");
CREATE INDEX "RecapShare_sharerId_localDate_idx" ON "RecapShare"("sharerId", "localDate");
CREATE INDEX "StepGoalEvent_at_idx" ON "StepGoalEvent"("at");

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StorySeen" ADD CONSTRAINT "StorySeen_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StorySeen" ADD CONSTRAINT "StorySeen_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecapShare" ADD CONSTRAINT "RecapShare_sharerId_fkey" FOREIGN KEY ("sharerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecapShare" ADD CONSTRAINT "RecapShare_recapId_fkey" FOREIGN KEY ("recapId") REFERENCES "Recap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StepGoalEvent" ADD CONSTRAINT "StepGoalEvent_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyHighlights" ADD CONSTRAINT "WeeklyHighlights_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
