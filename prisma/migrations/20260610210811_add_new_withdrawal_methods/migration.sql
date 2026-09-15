/*
  Warnings:

  - You are about to alter the column `balance` on the `MerchantWallet` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,2)`.
  - You are about to alter the column `pendingBalance` on the `MerchantWallet` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,2)`.
  - You are about to alter the column `totalEarned` on the `MerchantWallet` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,2)`.
  - You are about to drop the column `phone` on the `MerchantWithdrawal` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[reference]` on the table `MerchantTransaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `merchantId` to the `MerchantWithdrawal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phoneNumber` to the `MerchantWithdrawal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `MerchantWithdrawal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'withdrawal';

-- AlterTable
ALTER TABLE "MerchantTransaction" ADD COLUMN     "reference" TEXT,
ADD COLUMN     "withdrawalId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "MerchantWallet" ADD COLUMN     "lastWithdrawalAt" TIMESTAMP(3),
ADD COLUMN     "totalWithdrawn" DECIMAL(18,2) NOT NULL DEFAULT 0,
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "pendingBalance" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalEarned" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "MerchantWithdrawal" DROP COLUMN "phone",
ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "merchantId" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'mobile_money',
ADD COLUMN     "phoneNumber" TEXT NOT NULL,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "MerchantTransaction_reference_key" ON "MerchantTransaction"("reference");

-- CreateIndex
CREATE INDEX "MerchantTransaction_walletId_idx" ON "MerchantTransaction"("walletId");

-- CreateIndex
CREATE INDEX "MerchantTransaction_orderId_idx" ON "MerchantTransaction"("orderId");

-- CreateIndex
CREATE INDEX "MerchantTransaction_createdAt_idx" ON "MerchantTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "MerchantWithdrawal_merchantId_idx" ON "MerchantWithdrawal"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantWithdrawal_status_idx" ON "MerchantWithdrawal"("status");

-- CreateIndex
CREATE INDEX "MerchantWithdrawal_createdAt_idx" ON "MerchantWithdrawal"("createdAt");

-- AddForeignKey
ALTER TABLE "MerchantTransaction" ADD CONSTRAINT "MerchantTransaction_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "MerchantWithdrawal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantWithdrawal" ADD CONSTRAINT "MerchantWithdrawal_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
