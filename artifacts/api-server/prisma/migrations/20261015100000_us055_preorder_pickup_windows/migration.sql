-- US-055: allow several non-overlapping preorder pickup windows per weekday.
-- Overlap is validated by the API; existing one-window-per-day rows stay valid.

-- DropIndex
DROP INDEX "vendor_preorder_availability_vendorId_dayOfWeek_key";

-- CreateIndex
CREATE INDEX "vendor_preorder_availability_vendorId_dayOfWeek_idx" ON "vendor_preorder_availability"("vendorId", "dayOfWeek");
