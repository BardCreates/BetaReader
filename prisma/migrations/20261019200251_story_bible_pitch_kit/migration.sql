-- CreateTable
CREATE TABLE "StoryFact" (
    "id" TEXT NOT NULL,
    "manuscriptId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchKit" (
    "id" TEXT NOT NULL,
    "manuscriptId" TEXT NOT NULL,
    "status" "ReadingStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "content" JSONB,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitchKit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryFact_manuscriptId_idx" ON "StoryFact"("manuscriptId");

-- CreateIndex
CREATE INDEX "StoryFact_chapterId_idx" ON "StoryFact"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "PitchKit_manuscriptId_key" ON "PitchKit"("manuscriptId");

-- AddForeignKey
ALTER TABLE "StoryFact" ADD CONSTRAINT "StoryFact_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "Manuscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryFact" ADD CONSTRAINT "StoryFact_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchKit" ADD CONSTRAINT "PitchKit_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "Manuscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
