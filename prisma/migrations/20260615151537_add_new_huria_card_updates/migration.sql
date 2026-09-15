/*
  Warnings:

  - A unique constraint covering the columns `[reference]` on the table `CardTransaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[requestId]` on the table `Withdrawal` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `CardTransaction` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `CardTransaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `requestId` to the `Withdrawal` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CardTransactionType" AS ENUM ('TOPUP', 'PURCHASE', 'REFUND', 'REVERSAL', 'CASHBACK', 'ADJUSTMENT', 'SUBSCRIPTION', 'TRANSFER');

-- DropIndex
DROP INDEX "CardTransaction_reference_idx";

-- AlterTable
ALTER TABLE "CardTransaction" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "gatewayVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "type",
ADD COLUMN     "type" "CardTransactionType" NOT NULL;

-- AlterTable
ALTER TABLE "HuriaCard" ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastTransactionAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN     "requestId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CardTransaction_reference_key" ON "CardTransaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_requestId_key" ON "Withdrawal"("requestId");
