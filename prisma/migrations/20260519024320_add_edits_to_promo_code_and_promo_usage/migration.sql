-- CreateIndex
CREATE INDEX "PromoCode_type_idx" ON "PromoCode"("type");

-- CreateIndex
CREATE INDEX "PromoCode_isActive_idx" ON "PromoCode"("isActive");

-- CreateIndex
CREATE INDEX "PromoUsage_orderId_idx" ON "PromoUsage"("orderId");
