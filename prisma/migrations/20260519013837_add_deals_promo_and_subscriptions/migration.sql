-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "dealDiscount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dealEndDate" TIMESTAMP(3),
ADD COLUMN     "discountEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flashDiscount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "flashSaleEnd" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT DEFAULT 'unisex',
ADD COLUMN     "isDeal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFlashSale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "newUserDiscount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Product_isFlashSale_flashSaleEnd_idx" ON "Product"("isFlashSale", "flashSaleEnd");

-- CreateIndex
CREATE INDEX "Product_isDeal_dealEndDate_idx" ON "Product"("isDeal", "dealEndDate");

-- CreateIndex
CREATE INDEX "Product_gender_idx" ON "Product"("gender");

-- CreateIndex
CREATE INDEX "Product_tags_idx" ON "Product"("tags");

-- CreateIndex
CREATE INDEX "Product_rating_idx" ON "Product"("rating");
