-- The target's handle as it was when the request was sent: the sender's outgoing list never shows
-- the target's current handle. Nullable and additive.
ALTER TABLE "BuddyRequest" ADD COLUMN "toHandleAtSend" TEXT;
