-- AlterTable
ALTER TABLE "ChapterReview" ADD COLUMN     "confusion" INTEGER,
ADD COLUMN     "driftQuote" TEXT,
ADD COLUMN     "driftReason" TEXT;

-- AlterTable
ALTER TABLE "Manuscript" ADD COLUMN     "draft" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "DraftSnapshot" (
    "id" TEXT NOT NULL,
    "manuscriptId" TEXT NOT NULL,
    "draft" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftSnapshot_manuscriptId_createdAt_idx" ON "DraftSnapshot"("manuscriptId", "createdAt");

-- AddForeignKey
ALTER TABLE "DraftSnapshot" ADD CONSTRAINT "DraftSnapshot_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "Manuscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
