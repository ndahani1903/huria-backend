/*
  Warnings:

  - You are about to alter the column `discountAmount` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,2)`.
  - You are about to alter the column `finalAmount` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,2)`.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ALTER COLUMN "discountAmount" SET DEFAULT 0,
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "discountPercentage" SET DEFAULT 0,
ALTER COLUMN "finalAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "platformName" TEXT NOT NULL DEFAULT 'HURIA Delivery',
    "platformFeePercentage" INTEGER NOT NULL DEFAULT 20,
    "minDeliveryFee" INTEGER NOT NULL DEFAULT 2000,
    "maxDeliveryFee" INTEGER NOT NULL DEFAULT 10000,
    "freeDeliveryThreshold" INTEGER NOT NULL DEFAULT 50000,
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "driverAutoAssignEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxDriverDistance" INTEGER NOT NULL DEFAULT 5,
    "autoBackupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoBackupTime" TEXT NOT NULL DEFAULT '02:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY['read']::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Backup_createdAt_idx" ON "Backup"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_key_idx" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_status_idx" ON "ApiKey"("status");

-- CreateIndex
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");
