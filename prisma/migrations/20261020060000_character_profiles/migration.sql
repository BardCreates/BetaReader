-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "age" TEXT,
ADD COLUMN     "appearance" TEXT,
ADD COLUMN     "backstory" TEXT,
ADD COLUMN     "fears" TEXT,
ADD COLUMN     "imageUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "personality" TEXT,
ADD COLUMN     "pronouns" TEXT,
ADD COLUMN     "voice" TEXT,
ADD COLUMN     "wants" TEXT;

-- CreateTable
CREATE TABLE "CharacterImage" (
    "characterId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "type" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterImage_pkey" PRIMARY KEY ("characterId")
);

-- AddForeignKey
ALTER TABLE "CharacterImage" ADD CONSTRAINT "CharacterImage_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

