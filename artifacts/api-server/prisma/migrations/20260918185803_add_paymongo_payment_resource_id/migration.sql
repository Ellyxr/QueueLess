-- AlterTable
ALTER TABLE "payments" ADD COLUMN "providerPaymentResourceId" TEXT;

-- CreateIndex
CREATE INDEX "payments_providerPaymentResourceId_idx" ON "payments"("providerPaymentResourceId");
