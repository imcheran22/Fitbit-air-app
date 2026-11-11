-- Social S3 (the S2 deferral): a story is seen up to the newest frame reached, so a later frame lights the ring again.
-- Additive only.

-- AlterTable
ALTER TABLE "StorySeen" ADD COLUMN "lastFrameAt" TIMESTAMP(3);
