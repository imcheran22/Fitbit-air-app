-- Social tab S3 Chats: indexes for the cascades on unpair, block and account deletion, and an id tiebreak on the
-- inbox indexes (like BuddyPair). Index-only.

-- DropIndex
DROP INDEX "Conversation_userAId_lastMessageAt_idx";
DROP INDEX "Conversation_userBId_lastMessageAt_idx";

-- CreateIndex
CREATE INDEX "Conversation_userAId_lastMessageAt_id_idx" ON "Conversation"("userAId", "lastMessageAt", "id");
CREATE INDEX "Conversation_userBId_lastMessageAt_id_idx" ON "Conversation"("userBId", "lastMessageAt", "id");
CREATE INDEX "Message_replyToMessageId_idx" ON "Message"("replyToMessageId");
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX "Report_reportedUserId_idx" ON "Report"("reportedUserId");
