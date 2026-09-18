-- AlterTable
ALTER TABLE "payment_idempotency_keys" ADD COLUMN     "checkoutSessionId" TEXT,
ADD COLUMN     "checkoutUrl" TEXT;
