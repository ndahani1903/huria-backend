/*
  Warnings:

  - You are about to drop the column `operatingHours` on the `Merchant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Merchant" DROP COLUMN "operatingHours",
ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "logoImage" TEXT;

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "adminAlertPhones" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ManualDispatchQueue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedTo" TEXT,
    "assignedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualDispatchQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminEscalationQueue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT,
    "merchantPhone" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT,
    "contactedAt" TIMESTAMP(3),
    "contactedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminEscalationQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrgentAdminTasks" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'HIGH',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedTo" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UrgentAdminTasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingReassignments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "newMerchantId" TEXT NOT NULL,
    "missingItems" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_customer_approval',
    "customerResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingReassignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManualDispatchQueue_orderId_key" ON "ManualDispatchQueue"("orderId");

-- CreateIndex
CREATE INDEX "ManualDispatchQueue_status_idx" ON "ManualDispatchQueue"("status");

-- CreateIndex
CREATE INDEX "ManualDispatchQueue_merchantId_idx" ON "ManualDispatchQueue"("merchantId");

-- CreateIndex
CREATE INDEX "ManualDispatchQueue_createdAt_idx" ON "ManualDispatchQueue"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminEscalationQueue_orderId_key" ON "AdminEscalationQueue"("orderId");

-- CreateIndex
CREATE INDEX "AdminEscalationQueue_status_idx" ON "AdminEscalationQueue"("status");

-- CreateIndex
CREATE INDEX "AdminEscalationQueue_createdAt_idx" ON "AdminEscalationQueue"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UrgentAdminTasks_orderId_key" ON "UrgentAdminTasks"("orderId");

-- CreateIndex
CREATE INDEX "UrgentAdminTasks_status_priority_idx" ON "UrgentAdminTasks"("status", "priority");

-- CreateIndex
CREATE INDEX "UrgentAdminTasks_createdAt_idx" ON "UrgentAdminTasks"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PendingReassignments_orderId_key" ON "PendingReassignments"("orderId");

-- CreateIndex
CREATE INDEX "PendingReassignments_status_idx" ON "PendingReassignments"("status");

-- CreateIndex
CREATE INDEX "PendingReassignments_createdAt_idx" ON "PendingReassignments"("createdAt");

-- AddForeignKey
ALTER TABLE "ManualDispatchQueue" ADD CONSTRAINT "ManualDispatchQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE;
