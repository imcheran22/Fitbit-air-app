-- KIP colour (spec 2026-10-13): each user's KIP colour by name; existing users are coral.
ALTER TABLE "User" ADD COLUMN "kipColour" TEXT NOT NULL DEFAULT 'coral';
