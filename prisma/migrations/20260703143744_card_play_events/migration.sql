-- DropIndex
DROP INDEX "CardPlayStat_userId_role_cardKind_key";

-- AlterTable
ALTER TABLE "CardPlayStat" ADD COLUMN     "round" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "CardPlayEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "card" "CardKind" NOT NULL,
    "round" INTEGER NOT NULL,
    "betMultiplier" INTEGER NOT NULL,
    "won" BOOLEAN NOT NULL,
    "folded" BOOLEAN NOT NULL,
    "foldedSelf" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPlayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardPlayEvent_userId_role_idx" ON "CardPlayEvent"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CardPlayStat_userId_role_cardKind_round_key" ON "CardPlayStat"("userId", "role", "cardKind", "round");

-- AddForeignKey
ALTER TABLE "CardPlayEvent" ADD CONSTRAINT "CardPlayEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

