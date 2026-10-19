-- AlterTable
ALTER TABLE "Manuscript" ADD COLUMN     "errorCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "billingInterval" TEXT,
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chatUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "costMicros" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "grammarWordsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passChat" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passCostMicros" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passGrammarWords" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passPitchKits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passWords" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "pitchKitsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT,
ADD COLUMN     "wordsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "manuscriptId" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

