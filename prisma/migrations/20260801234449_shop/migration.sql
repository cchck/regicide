-- AlterTable
ALTER TABLE "User" ADD COLUMN     "loadout" JSONB,
ADD COLUMN     "seals" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OwnedItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "boughtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OwnedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnedItem_userId_itemId_key" ON "OwnedItem"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "OwnedItem" ADD CONSTRAINT "OwnedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

