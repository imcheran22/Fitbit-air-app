-- Social tab S2 Campfire (spec docs/superpowers/specs/2026-10-07-social-tab-design.md §6). Additive only.

-- CreateTable
CREATE TABLE "Goodnight" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "onTime" BOOLEAN NOT NULL,
    CONSTRAINT "Goodnight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampNote" (
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CampNote_pkey" PRIMARY KEY ("authorId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Goodnight_authorId_localDate_key" ON "Goodnight"("authorId", "localDate");
CREATE INDEX "Goodnight_at_idx" ON "Goodnight"("at");
CREATE INDEX "CampNote_expiresAt_idx" ON "CampNote"("expiresAt");
CREATE INDEX "WeeklyHighlights_weekStart_idx" ON "WeeklyHighlights"("weekStart");

-- AddForeignKey
ALTER TABLE "Goodnight" ADD CONSTRAINT "Goodnight_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampNote" ADD CONSTRAINT "CampNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
