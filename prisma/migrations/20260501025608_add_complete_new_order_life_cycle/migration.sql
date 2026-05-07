-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'ready_for_pickup';
ALTER TYPE "OrderStatus" ADD VALUE 'arrived_pickup';
ALTER TYPE "OrderStatus" ADD VALUE 'en_route';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "addressId" TEXT,
ADD COLUMN     "deliveryAddressId" TEXT,
ADD COLUMN     "deliveryArrivalTime" TIMESTAMP(3),
ADD COLUMN     "deliveryTime" TIMESTAMP(3),
ADD COLUMN     "estimatedDistance" DOUBLE PRECISION,
ADD COLUMN     "estimatedDuration" INTEGER,
ADD COLUMN     "merchantConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pickupArrivalTime" TIMESTAMP(3),
ADD COLUMN     "pickupTime" TIMESTAMP(3),
ADD COLUMN     "readyForPickup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "routeGeometry" JSONB,
ADD COLUMN     "tripStage" "OrderStatus" NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Address_userId_isDefault_idx" ON "Address"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "Address_isDefault_idx" ON "Address"("isDefault");

-- CreateIndex
CREATE INDEX "Address_lat_lng_idx" ON "Address"("lat", "lng");

-- CreateIndex
CREATE INDEX "Driver_status_currentLat_currentLng_idx" ON "Driver"("status", "currentLat", "currentLng");

-- CreateIndex
CREATE INDEX "Order_tripStage_idx" ON "Order"("tripStage");

-- CreateIndex
CREATE INDEX "Order_readyForPickup_idx" ON "Order"("readyForPickup");

-- CreateIndex
CREATE INDEX "Order_merchantConfirmed_idx" ON "Order"("merchantConfirmed");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
