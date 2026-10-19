-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "contentUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "doc" JSONB;

-- AlterTable
ALTER TABLE "ChapterReview" ADD COLUMN     "readAt" TIMESTAMP(3);

