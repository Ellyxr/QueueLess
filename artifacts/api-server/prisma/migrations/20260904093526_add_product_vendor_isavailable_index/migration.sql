-- CreateIndex
CREATE INDEX "products_vendorId_isAvailable_idx" ON "products"("vendorId", "isAvailable");
