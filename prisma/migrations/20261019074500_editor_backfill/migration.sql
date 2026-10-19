-- Existing chapters were last changed when they were created, and existing reads count as current.
UPDATE "Chapter" SET "contentUpdatedAt" = "createdAt";
UPDATE "ChapterReview" SET "readAt" = "createdAt" WHERE "status" = 'DONE';
