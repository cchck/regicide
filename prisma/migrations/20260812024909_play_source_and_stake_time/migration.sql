-- CreateEnum
CREATE TYPE "PlaySource" AS ENUM ('AI', 'PVP');

-- AlterTable
ALTER TABLE "CardPlayEvent" ADD COLUMN     "source" "PlaySource" NOT NULL DEFAULT 'AI';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stakeAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CardPlayEvent_userId_createdAt_idx" ON "CardPlayEvent"("userId", "createdAt");
