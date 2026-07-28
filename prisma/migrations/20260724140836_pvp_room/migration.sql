-- CreateTable
CREATE TABLE "PvpRoom" (
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PvpRoom_pkey" PRIMARY KEY ("code")
);

