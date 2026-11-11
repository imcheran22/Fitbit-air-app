-- Pixel coaches (spec 2026-10-01 §7–8).
-- Two nullable settings; null means the default.
ALTER TABLE "User" ADD COLUMN "coachThinkingAttachment" TEXT;
ALTER TABLE "User" ADD COLUMN "coachThinkingText" TEXT;

-- The seven retired characters are cleared, so personaChosen is false and the
-- app shows the new picker once. Mochi carries over; NULL stays NULL.
UPDATE "User" SET "coachPersonaId" = NULL
WHERE "coachPersonaId" IN ('hoot', 'pip', 'nimbus', 'ember', 'beep', 'doze', 'beat');
