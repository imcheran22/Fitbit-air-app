-- The Direct / Encouraging / Clinical coach styles are replaced by the
-- companion characters (spec 2026-09-29, section 3). Move each stored style to
-- the character that replaced it. Data only; safe to re-run, since each UPDATE
-- matches only the legacy ids.
--
-- NULL stays NULL: those users never chose, resolve to Hoot, and see the
-- picker once (personaChosen is false). CoachDigest."personaId" keeps its
-- legacy values on purpose: it records which persona wrote a past recap.

UPDATE "User" SET "coachPersonaId" = 'pip' WHERE "coachPersonaId" = 'encouraging';
UPDATE "User" SET "coachPersonaId" = 'hoot' WHERE "coachPersonaId" = 'direct';
UPDATE "User" SET "coachPersonaId" = 'beep' WHERE "coachPersonaId" = 'clinical';
