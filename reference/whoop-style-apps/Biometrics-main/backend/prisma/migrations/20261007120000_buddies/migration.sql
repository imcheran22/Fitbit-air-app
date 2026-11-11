-- Buddies (spec 2026-10-06 buddies §3). Additive only.

-- CreateEnum
CREATE TYPE "BuddyRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StickerKind" AS ENUM ('CHEER', 'HEART', 'REST_UP', 'STAR');

-- CreateEnum
CREATE TYPE "BuddyActivityKind" AS ENUM ('STICKER', 'REQUEST', 'PAIRED', 'BUDDY_BADGE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "handle" TEXT,
ADD COLUMN "displayName" TEXT,
ADD COLUMN "shareRecovery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "shareSleepScore" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "shareHoursSlept" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "shareSteps" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "shareStreaks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "buddySharingConsentVersion" INTEGER,
ADD COLUMN "buddySharingConsentAt" TIMESTAMP(3),
ADD COLUMN "buddyMoodNoticeAt" TIMESTAMP(3),
ADD COLUMN "notifyBuddyStickers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyBuddyRequests" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyBuddyBadges" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "BuddyPair" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuddyPair_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BuddyPair_ordered_check" CHECK ("userAId" < "userBId")
);

-- CreateTable
CREATE TABLE "BuddyRequest" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "BuddyRequestStatus" NOT NULL DEFAULT 'PENDING',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "BuddyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuddyCode" (
    "code" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,

    CONSTRAINT "BuddyCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "BuddyBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuddyBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "BuddyMute" (
    "muterId" TEXT NOT NULL,
    "mutedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuddyMute_pkey" PRIMARY KEY ("muterId","mutedId")
);

-- CreateTable
CREATE TABLE "Sticker" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "kind" "StickerKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuddyActivity" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" "BuddyActivityKind" NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "BuddyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandleHold" (
    "handleHash" TEXT NOT NULL,
    "previousOwnerId" TEXT,
    "releasedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandleHold_pkey" PRIMARY KEY ("handleHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "BuddyPair_userAId_userBId_key" ON "BuddyPair"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "BuddyPair_userAId_lastActivityAt_id_idx" ON "BuddyPair"("userAId", "lastActivityAt", "id");

-- CreateIndex
CREATE INDEX "BuddyPair_userBId_lastActivityAt_id_idx" ON "BuddyPair"("userBId", "lastActivityAt", "id");

-- CreateIndex
CREATE INDEX "BuddyRequest_fromUserId_status_createdAt_idx" ON "BuddyRequest"("fromUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BuddyRequest_toUserId_status_createdAt_idx" ON "BuddyRequest"("toUserId", "status", "createdAt");

-- CreateIndex (not modelled by Prisma): at most one PENDING request per ordered pair.
CREATE UNIQUE INDEX "BuddyRequest_one_pending_key" ON "BuddyRequest"("fromUserId", "toUserId") WHERE "status" = 'PENDING';

-- CreateIndex
CREATE INDEX "BuddyCode_ownerId_expiresAt_idx" ON "BuddyCode"("ownerId", "expiresAt");

-- CreateIndex
CREATE INDEX "BuddyCode_createdAt_idx" ON "BuddyCode"("createdAt");

-- CreateIndex
CREATE INDEX "BuddyBlock_blockedId_idx" ON "BuddyBlock"("blockedId");

-- CreateIndex
CREATE INDEX "BuddyMute_mutedId_idx" ON "BuddyMute"("mutedId");

-- CreateIndex
CREATE INDEX "Sticker_fromUserId_toUserId_sentAt_idx" ON "Sticker"("fromUserId", "toUserId", "sentAt");

-- CreateIndex
CREATE INDEX "Sticker_toUserId_fromUserId_seenAt_idx" ON "Sticker"("toUserId", "fromUserId", "seenAt");

-- CreateIndex
CREATE UNIQUE INDEX "BuddyActivity_recipientId_kind_refId_key" ON "BuddyActivity"("recipientId", "kind", "refId");

-- CreateIndex
CREATE INDEX "BuddyActivity_recipientId_createdAt_id_idx" ON "BuddyActivity"("recipientId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "BuddyActivity_actorId_idx" ON "BuddyActivity"("actorId");

-- CreateIndex
CREATE INDEX "HandleHold_previousOwnerId_idx" ON "HandleHold"("previousOwnerId");

-- AddForeignKey
ALTER TABLE "BuddyPair" ADD CONSTRAINT "BuddyPair_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyPair" ADD CONSTRAINT "BuddyPair_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyRequest" ADD CONSTRAINT "BuddyRequest_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyRequest" ADD CONSTRAINT "BuddyRequest_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyCode" ADD CONSTRAINT "BuddyCode_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyCode" ADD CONSTRAINT "BuddyCode_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuddyBlock" ADD CONSTRAINT "BuddyBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyBlock" ADD CONSTRAINT "BuddyBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyMute" ADD CONSTRAINT "BuddyMute_muterId_fkey" FOREIGN KEY ("muterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyMute" ADD CONSTRAINT "BuddyMute_mutedId_fkey" FOREIGN KEY ("mutedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyActivity" ADD CONSTRAINT "BuddyActivity_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyActivity" ADD CONSTRAINT "BuddyActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HandleHold" ADD CONSTRAINT "HandleHold_previousOwnerId_fkey" FOREIGN KEY ("previousOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
