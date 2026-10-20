-- AlterTable
ALTER TABLE "Manuscript" ADD COLUMN     "draft" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ChapterReview" ADD COLUMN     "draft" INTEGER,
ADD COLUMN     "dropOff" JSONB;

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "conflictChapter" INTEGER,
ADD COLUMN     "conflictFact" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "mode" TEXT,
ADD COLUMN     "noteId" TEXT;

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "manuscriptId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Draft_manuscriptId_number_key" ON "Draft"("manuscriptId", "number");

-- CreateIndex
CREATE INDEX "Conversation_noteId_idx" ON "Conversation"("noteId");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "Manuscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

