-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "totalEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MerchantAdvance" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "remainingBalance" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "repaymentPercentage" DOUBLE PRECISION NOT NULL,
    "dailyRepayment" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedEndDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repayment" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salesAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Repayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverAdvance" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "remainingBalance" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "repaymentPercentage" DOUBLE PRECISION NOT NULL,
    "dailyRepayment" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedEndDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverRepayment" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "earningsAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DriverRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantAdvance_merchantId_idx" ON "MerchantAdvance"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantAdvance_status_idx" ON "MerchantAdvance"("status");

-- CreateIndex
CREATE INDEX "Repayment_advanceId_idx" ON "Repayment"("advanceId");

-- CreateIndex
CREATE INDEX "Repayment_date_idx" ON "Repayment"("date");

-- CreateIndex
CREATE INDEX "DriverAdvance_driverId_idx" ON "DriverAdvance"("driverId");

-- CreateIndex
CREATE INDEX "DriverAdvance_status_idx" ON "DriverAdvance"("status");

-- CreateIndex
CREATE INDEX "DriverRepayment_advanceId_idx" ON "DriverRepayment"("advanceId");

-- CreateIndex
CREATE INDEX "DriverRepayment_date_idx" ON "DriverRepayment"("date");

-- AddForeignKey
ALTER TABLE "MerchantAdvance" ADD CONSTRAINT "MerchantAdvance_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "MerchantAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAdvance" ADD CONSTRAINT "DriverAdvance_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverRepayment" ADD CONSTRAINT "DriverRepayment_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "DriverAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
