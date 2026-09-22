-- CreateEnum
CREATE TYPE "RefundInitiator" AS ENUM ('BUYER', 'SYSTEM');

-- AlterEnum
ALTER TYPE "CancellationReason" ADD VALUE 'AUTO_REFUND_TIMEOUT';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "buyerContactPingAt" TIMESTAMPTZ(6),
ADD COLUMN     "paidAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "category" TEXT,
ADD COLUMN     "initiatedBy" "RefundInitiator" NOT NULL DEFAULT 'BUYER',
ADD COLUMN     "orderId" UUID;

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
