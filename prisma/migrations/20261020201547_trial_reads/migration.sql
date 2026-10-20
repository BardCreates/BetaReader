-- DropForeignKey
ALTER TABLE "AiUsage" DROP CONSTRAINT "AiUsage_userId_fkey";

-- AlterTable
ALTER TABLE "AiUsage" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TrialRead" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "title" TEXT,
    "genre" TEXT,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "midBook" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReadingStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrialRead_ipHash_createdAt_idx" ON "TrialRead"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "TrialRead_createdAt_idx" ON "TrialRead"("createdAt");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
