-- AlterTable
ALTER TABLE "CoachMemory" ADD COLUMN     "conversationId" TEXT;

-- Existing rows may already hold duplicates: createPendingMemories only ever
-- checked for them with a read-then-write, which two turns could pass at the
-- same time. The unique index below cannot be created while any remain, so
-- collapse each (userId, category, value) group to its earliest row -- the one
-- whose CONFIRMED status, if any, the user actually acted on.
DELETE FROM "CoachMemory" a
USING "CoachMemory" b
WHERE a."userId" = b."userId"
  AND a."category" = b."category"
  AND a."value" = b."value"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

-- CreateIndex
CREATE UNIQUE INDEX "CoachMemory_userId_category_value_key" ON "CoachMemory"("userId", "category", "value");

-- CreateIndex
CREATE INDEX "CoachMemory_conversationId_status_idx" ON "CoachMemory"("conversationId", "status");

-- AddForeignKey
ALTER TABLE "CoachMemory" ADD CONSTRAINT "CoachMemory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CoachConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
