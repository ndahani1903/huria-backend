/*
  Warnings:

  - You are about to drop the column `merchantId` on the `Escrow` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Escrow" DROP COLUMN "merchantId";

-- CreateTable
CREATE TABLE "EscrowMerchant" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "EscrowMerchant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EscrowMerchant_escrowId_merchantId_key" ON "EscrowMerchant"("escrowId", "merchantId");

-- AddForeignKey
ALTER TABLE "EscrowMerchant" ADD CONSTRAINT "EscrowMerchant_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "Escrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowMerchant" ADD CONSTRAINT "EscrowMerchant_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
