-- CreateEnum
CREATE TYPE "CoachMemoryCategory" AS ENUM ('TRAINING_GOAL', 'SCHEDULE', 'PREFERENCE');

-- CreateEnum
CREATE TYPE "CoachMemoryStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('ios', 'android');

-- CreateTable
CREATE TABLE "CoachMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "CoachMemoryCategory" NOT NULL,
    "value" VARCHAR(140) NOT NULL,
    "status" "CoachMemoryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "CoachMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachDigest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachMemory_userId_status_createdAt_idx" ON "CoachMemory"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CoachDigest_userId_createdAt_idx" ON "CoachDigest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoachDigest_userId_weekStart_key" ON "CoachDigest"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- AddForeignKey
ALTER TABLE "CoachMemory" ADD CONSTRAINT "CoachMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachDigest" ADD CONSTRAINT "CoachDigest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
