-- CreateEnum
CREATE TYPE "HabitCorrelationStatus" AS ENUM ('CANDIDATE', 'CONFIRMED', 'RETIRED');

-- CreateTable
CREATE TABLE "HabitType" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "exposureThreshold" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "habitType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL,
    "habitDay" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "habitDay" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitCorrelation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "habitType" TEXT NOT NULL,
    "factor" TEXT NOT NULL,
    "lagDays" INTEGER NOT NULL,
    "status" "HabitCorrelationStatus" NOT NULL,
    "consecutivePasses" INTEGER NOT NULL DEFAULT 0,
    "consecutiveMisses" INTEGER NOT NULL DEFAULT 0,
    "lastEvaluatedAt" TIMESTAMP(3) NOT NULL,
    "lastRunKey" TEXT NOT NULL,
    "r" DOUBLE PRECISION,
    "pValue" DOUBLE PRECISION,
    "qValue" DOUBLE PRECISION,
    "effectSizePercent" DOUBLE PRECISION,
    "comparisonPercent" DOUBLE PRECISION,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "direction" TEXT,
    "series" JSONB,

    CONSTRAINT "HabitCorrelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HabitType_userId_type_key" ON "HabitType"("userId", "type");

-- CreateIndex
CREATE INDEX "HabitLog_userId_habitDay_idx" ON "HabitLog"("userId", "habitDay");

-- CreateIndex
CREATE UNIQUE INDEX "HabitCheckIn_userId_habitDay_key" ON "HabitCheckIn"("userId", "habitDay");

-- CreateIndex
CREATE INDEX "HabitCorrelation_userId_status_idx" ON "HabitCorrelation"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HabitCorrelation_userId_habitType_factor_lagDays_key" ON "HabitCorrelation"("userId", "habitType", "factor", "lagDays");

-- AddForeignKey
ALTER TABLE "HabitType" ADD CONSTRAINT "HabitType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitLog" ADD CONSTRAINT "HabitLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitCheckIn" ADD CONSTRAINT "HabitCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitCorrelation" ADD CONSTRAINT "HabitCorrelation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

