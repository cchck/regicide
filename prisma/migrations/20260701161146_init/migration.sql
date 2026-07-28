-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPEROR', 'SLAVE');

-- CreateEnum
CREATE TYPE "CardKind" AS ENUM ('EMPEROR', 'CITIZEN', 'SLAVE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "chips" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardPlayStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "cardKind" "CardKind" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CardPlayStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CardPlayStat_userId_role_cardKind_key" ON "CardPlayStat"("userId", "role", "cardKind");

-- AddForeignKey
ALTER TABLE "CardPlayStat" ADD CONSTRAINT "CardPlayStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
