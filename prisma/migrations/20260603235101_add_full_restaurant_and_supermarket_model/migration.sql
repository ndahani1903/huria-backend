/*
  Warnings:

  - A unique constraint covering the columns `[barcode]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,status]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "WeightBracket" AS ENUM ('LIGHT', 'MEDIUM', 'HEAVY', 'VERY_HEAVY', 'BULK');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('motorcycle', 'bajaj', 'truck');

-- CreateEnum
CREATE TYPE "ShippingMode" AS ENUM ('LOCAL_DISPATCH', 'FBU_COURIER');

-- CreateEnum
CREATE TYPE "FBURequestStatus" AS ENUM ('pending_pickup', 'pickup_scheduled', 'picked_up', 'warehouse_received', 'dispatched', 'completed');

-- CreateEnum
CREATE TYPE "MerchantType" AS ENUM ('GENERAL_ECOMMERCE', 'SUPERMARKET', 'RESTAURANT');

-- CreateEnum
CREATE TYPE "OrderPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "aisleCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "cuisineType" TEXT,
ADD COLUMN     "dietaryTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "expressDeliveryAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasBarcodeScanner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAcceptingOrders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxDeliveryRadiusKm" DOUBLE PRECISION DEFAULT 40,
ADD COLUMN     "merchantType" "MerchantType" NOT NULL DEFAULT 'GENERAL_ECOMMERCE',
ADD COLUMN     "operatingHours" JSONB,
ADD COLUMN     "preparationTime" INTEGER DEFAULT 30,
ADD COLUMN     "supportsBulkDiscount" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "acceptanceDeadline" TIMESTAMP(3),
ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "aislePickingNotes" TEXT,
ADD COLUMN     "assignedVehicle" "VehicleType",
ADD COLUMN     "autoCancelAt" TIMESTAMP(3),
ADD COLUMN     "estimatedReadyTime" TIMESTAMP(3),
ADD COLUMN     "fbuPickupScheduled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fbuPickupScheduledAt" TIMESTAMP(3),
ADD COLUMN     "fbuWarehouseReceived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fbuWarehouseReceivedAt" TIMESTAMP(3),
ADD COLUMN     "logisticsMetadata" JSONB DEFAULT '{}',
ADD COLUMN     "orderPriority" "OrderPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "packingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "preparationCompletedAt" TIMESTAMP(3),
ADD COLUMN     "preparationStartedAt" TIMESTAMP(3),
ADD COLUMN     "readyForPickupAt" TIMESTAMP(3),
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "requiresDriverAt" TIMESTAMP(3),
ADD COLUMN     "shippingMode" "ShippingMode" NOT NULL DEFAULT 'LOCAL_DISPATCH',
ADD COLUMN     "totalAmount" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "aisleLocation" TEXT,
ADD COLUMN     "allowedVehicles" "VehicleType"[] DEFAULT ARRAY['motorcycle', 'bajaj', 'truck']::"VehicleType"[],
ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "bulkDiscountPercent" INTEGER,
ADD COLUMN     "bulkDiscountQuantity" INTEGER,
ADD COLUMN     "dietaryInfo" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "isAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isGlutenFree" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSpicy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isVegan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isVegetarian" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maximumOrderQuantity" INTEGER DEFAULT 99,
ADD COLUMN     "minimumOrderQuantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "modifiers" JSONB DEFAULT '[]',
ADD COLUMN     "nutritionalInfo" JSONB,
ADD COLUMN     "preparationTime" INTEGER DEFAULT 15,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "weight" DOUBLE PRECISION,
ADD COLUMN     "weightBracket" "WeightBracket" NOT NULL DEFAULT 'LIGHT';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "FBUWarehouseRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT,
    "merchantPhone" TEXT,
    "merchantAddress" TEXT,
    "merchantPickupLat" DOUBLE PRECISION,
    "merchantPickupLng" DOUBLE PRECISION,
    "items" JSONB NOT NULL,
    "totalWeight" DOUBLE PRECISION NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "status" "FBURequestStatus" NOT NULL DEFAULT 'pending_pickup',
    "pickupScheduledAt" TIMESTAMP(3),
    "pickupCompletedAt" TIMESTAMP(3),
    "warehouseReceivedAt" TIMESTAMP(3),
    "assignedWarehouseStaffId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FBUWarehouseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HuriaCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "cardName" TEXT NOT NULL DEFAULT 'HURIA Card',
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "hcoins" INTEGER NOT NULL DEFAULT 0,
    "dailyLimit" DECIMAL(18,2) NOT NULL DEFAULT 500000,
    "monthlyLimit" DECIMAL(18,2) NOT NULL DEFAULT 5000000,
    "dailySpent" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "monthlySpent" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashbackRate" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "discountRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HuriaCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HCoinTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HCoinTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardTransaction" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "orderId" TEXT,
    "reference" TEXT,
    "hcoinsEarned" INTEGER NOT NULL DEFAULT 0,
    "cashbackAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatingHours" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isSpecial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "polygon" JSONB,
    "minDeliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "maxRadiusKm" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreReview" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemModifier" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OrderItemModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverDispatchQueue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "assignedDriverId" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverDispatchQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FBUWarehouseRequest_orderId_key" ON "FBUWarehouseRequest"("orderId");

-- CreateIndex
CREATE INDEX "FBUWarehouseRequest_orderId_idx" ON "FBUWarehouseRequest"("orderId");

-- CreateIndex
CREATE INDEX "FBUWarehouseRequest_merchantId_idx" ON "FBUWarehouseRequest"("merchantId");

-- CreateIndex
CREATE INDEX "FBUWarehouseRequest_status_idx" ON "FBUWarehouseRequest"("status");

-- CreateIndex
CREATE INDEX "FBUWarehouseRequest_createdAt_idx" ON "FBUWarehouseRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HuriaCard_userId_key" ON "HuriaCard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HuriaCard_cardNumber_key" ON "HuriaCard"("cardNumber");

-- CreateIndex
CREATE INDEX "HuriaCard_userId_idx" ON "HuriaCard"("userId");

-- CreateIndex
CREATE INDEX "HuriaCard_cardNumber_idx" ON "HuriaCard"("cardNumber");

-- CreateIndex
CREATE INDEX "HCoinTransaction_userId_idx" ON "HCoinTransaction"("userId");

-- CreateIndex
CREATE INDEX "HCoinTransaction_createdAt_idx" ON "HCoinTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "CardTransaction_cardId_idx" ON "CardTransaction"("cardId");

-- CreateIndex
CREATE INDEX "CardTransaction_orderId_idx" ON "CardTransaction"("orderId");

-- CreateIndex
CREATE INDEX "CardTransaction_reference_idx" ON "CardTransaction"("reference");

-- CreateIndex
CREATE INDEX "OperatingHours_merchantId_idx" ON "OperatingHours"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatingHours_merchantId_dayOfWeek_key" ON "OperatingHours"("merchantId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "DeliveryZone_merchantId_idx" ON "DeliveryZone"("merchantId");

-- CreateIndex
CREATE INDEX "DeliveryZone_isActive_idx" ON "DeliveryZone"("isActive");

-- CreateIndex
CREATE INDEX "StoreReview_merchantId_idx" ON "StoreReview"("merchantId");

-- CreateIndex
CREATE INDEX "StoreReview_rating_idx" ON "StoreReview"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "StoreReview_merchantId_userId_key" ON "StoreReview"("merchantId", "userId");

-- CreateIndex
CREATE INDEX "OrderItemModifier_orderItemId_idx" ON "OrderItemModifier"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverDispatchQueue_orderId_key" ON "DriverDispatchQueue"("orderId");

-- CreateIndex
CREATE INDEX "DriverDispatchQueue_status_priority_idx" ON "DriverDispatchQueue"("status", "priority");

-- CreateIndex
CREATE INDEX "DriverDispatchQueue_merchantId_idx" ON "DriverDispatchQueue"("merchantId");

-- CreateIndex
CREATE INDEX "DriverDispatchQueue_createdAt_idx" ON "DriverDispatchQueue"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_status_key" ON "Subscription"("userId", "status");

-- AddForeignKey
ALTER TABLE "FBUWarehouseRequest" ADD CONSTRAINT "FBUWarehouseRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FBUWarehouseRequest" ADD CONSTRAINT "FBUWarehouseRequest_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HuriaCard" ADD CONSTRAINT "HuriaCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HCoinTransaction" ADD CONSTRAINT "HCoinTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTransaction" ADD CONSTRAINT "CardTransaction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "HuriaCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatingHours" ADD CONSTRAINT "OperatingHours_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreReview" ADD CONSTRAINT "StoreReview_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreReview" ADD CONSTRAINT "StoreReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDispatchQueue" ADD CONSTRAINT "DriverDispatchQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDispatchQueue" ADD CONSTRAINT "DriverDispatchQueue_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
