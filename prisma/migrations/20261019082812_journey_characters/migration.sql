-- CreateEnum
CREATE TYPE "ThreadKind" AS ENUM ('QUESTION', 'PREDICTION');

-- CreateEnum
CREATE TYPE "ThreadOutcome" AS ENUM ('OPEN', 'ANSWERED', 'CONFIRMED', 'REFUTED');

-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "intent" TEXT;

-- AlterTable
ALTER TABLE "ChapterReview" ADD COLUMN     "intentCheck" JSONB,
ADD COLUMN     "revisionCheck" JSONB;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "asOfChapter" INTEGER,
ADD COLUMN     "characterId" TEXT;

-- CreateTable
CREATE TABLE "ReaderThread" (
    "id" TEXT NOT NULL,
    "manuscriptId" TEXT NOT NULL,
    "kind" "ThreadKind" NOT NULL,
    "text" TEXT NOT NULL,
    "raisedChapterId" TEXT NOT NULL,
    "resolvedChapterId" TEXT,
    "outcome" "ThreadOutcome" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReaderThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "manuscriptId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" JSONB,
    "role" TEXT,
    "summary" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReaderThread_manuscriptId_idx" ON "ReaderThread"("manuscriptId");

-- CreateIndex
CREATE INDEX "Character_manuscriptId_idx" ON "Character"("manuscriptId");

-- CreateIndex
CREATE INDEX "Conversation_characterId_idx" ON "Conversation"("characterId");

-- AddForeignKey
ALTER TABLE "ReaderThread" ADD CONSTRAINT "ReaderThread_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "Manuscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReaderThread" ADD CONSTRAINT "ReaderThread_raisedChapterId_fkey" FOREIGN KEY ("raisedChapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReaderThread" ADD CONSTRAINT "ReaderThread_resolvedChapterId_fkey" FOREIGN KEY ("resolvedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "Manuscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
