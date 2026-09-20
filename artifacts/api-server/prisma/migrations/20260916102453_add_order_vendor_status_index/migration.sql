-- CreateIndex
CREATE INDEX "orders_vendorId_status_idx" ON "orders"("vendorId", "status");
