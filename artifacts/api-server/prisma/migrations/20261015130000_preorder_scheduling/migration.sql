-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "CancellationReason" ADD VALUE 'PAYMENT_EXPIRED';

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN "preorderMinLeadTimeMinutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "orders"
  ADD COLUMN "pickupAt" TIMESTAMPTZ(6),
  ADD COLUMN "scheduledReleaseAt" TIMESTAMPTZ(6),
  ADD COLUMN "paymentExpiresAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "orders_status_scheduledReleaseAt_idx" ON "orders"("status", "scheduledReleaseAt");
CREATE INDEX "orders_status_paymentExpiresAt_idx" ON "orders"("status", "paymentExpiresAt");
