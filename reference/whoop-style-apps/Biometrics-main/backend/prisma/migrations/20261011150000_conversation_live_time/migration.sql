-- Social tab S3 Chats: the inbox orders by each conversation's newest LIVE message, so an unsent message never lifts a
-- row or shows in a cursor. Additive: a nullable column, its backfill from the live messages, and two indexes.

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "lastLiveMessageAt" TIMESTAMP(3);

-- Backfill: the newest live message's time; NULL when every message is unsent.
UPDATE "Conversation" c
SET "lastLiveMessageAt" = (SELECT MAX(m."createdAt") FROM "Message" m WHERE m."conversationId" = c."id" AND m."deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "Conversation_userAId_lastLiveMessageAt_id_idx" ON "Conversation"("userAId", "lastLiveMessageAt", "id");
CREATE INDEX "Conversation_userBId_lastLiveMessageAt_id_idx" ON "Conversation"("userBId", "lastLiveMessageAt", "id");
