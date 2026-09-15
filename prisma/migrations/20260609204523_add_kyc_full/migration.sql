-- CreateEnum
CREATE TYPE "KYCStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED', 'FROZEN');

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "frozenAt" TIMESTAMP(3),
ADD COLUMN     "kycStatus" "KYCStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN     "kycSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "kycVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "kycVerifiedBy" TEXT;

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "frozenAt" TIMESTAMP(3),
ADD COLUMN     "kycStatus" "KYCStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN     "kycSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "kycVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "kycVerifiedBy" TEXT;

-- CreateTable
CREATE TABLE "DriverKYC" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "nidaNumber" TEXT,
    "fullName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "licenseCardImage" TEXT,
    "nidaCardImage" TEXT,
    "passportPhoto" TEXT,
    "selfieImage" TEXT,
    "licenseNumber" TEXT,
    "plateNumber" TEXT,
    "vehicleType" TEXT,
    "kycStatus" "KYCStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "rejectionReason" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "frozenAt" TIMESTAMP(3),
    "unfrozenAt" TIMESTAMP(3),
    "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastVerificationRequest" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverKYC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantKYC" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "nidaNumber" TEXT,
    "fullName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "businessRegistrationNumber" TEXT,
    "nidaCardImage" TEXT,
    "passportPhoto" TEXT,
    "selfieImage" TEXT,
    "businessLicenseImage" TEXT,
    "logoImage" TEXT,
    "businessAddress" TEXT,
    "businessLat" DOUBLE PRECISION,
    "businessLng" DOUBLE PRECISION,
    "kycStatus" "KYCStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "rejectionReason" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "frozenAt" TIMESTAMP(3),
    "unfrozenAt" TIMESTAMP(3),
    "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastVerificationRequest" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantKYC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KYCAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "KYCStatus" NOT NULL,
    "reason" TEXT,
    "adminId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KYCAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrozenUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "FrozenUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverKYC_driverId_key" ON "DriverKYC"("driverId");

-- CreateIndex
CREATE INDEX "DriverKYC_kycStatus_idx" ON "DriverKYC"("kycStatus");

-- CreateIndex
CREATE INDEX "DriverKYC_driverId_idx" ON "DriverKYC"("driverId");

-- CreateIndex
CREATE INDEX "DriverKYC_frozenAt_idx" ON "DriverKYC"("frozenAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantKYC_merchantId_key" ON "MerchantKYC"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantKYC_kycStatus_idx" ON "MerchantKYC"("kycStatus");

-- CreateIndex
CREATE INDEX "MerchantKYC_merchantId_idx" ON "MerchantKYC"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantKYC_frozenAt_idx" ON "MerchantKYC"("frozenAt");

-- CreateIndex
CREATE INDEX "KYCAuditLog_userId_idx" ON "KYCAuditLog"("userId");

-- CreateIndex
CREATE INDEX "KYCAuditLog_createdAt_idx" ON "KYCAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "KYCAuditLog_action_idx" ON "KYCAuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "FrozenUser_userId_key" ON "FrozenUser"("userId");

-- CreateIndex
CREATE INDEX "FrozenUser_frozenAt_idx" ON "FrozenUser"("frozenAt");

-- CreateIndex
CREATE INDEX "Driver_kycStatus_idx" ON "Driver"("kycStatus");

-- CreateIndex
CREATE INDEX "Driver_frozenAt_idx" ON "Driver"("frozenAt");

-- CreateIndex
CREATE INDEX "Merchant_kycStatus_idx" ON "Merchant"("kycStatus");

-- CreateIndex
CREATE INDEX "Merchant_frozenAt_idx" ON "Merchant"("frozenAt");

-- AddForeignKey
ALTER TABLE "DriverKYC" ADD CONSTRAINT "DriverKYC_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantKYC" ADD CONSTRAINT "MerchantKYC_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
