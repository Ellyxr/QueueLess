-- CreateTable
CREATE TABLE "payment_idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "paymentShareId" UUID NOT NULL,
    "paymentId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_idempotency_keys_paymentShareId_idx" ON "payment_idempotency_keys"("paymentShareId");

-- CreateIndex
CREATE INDEX "payment_idempotency_keys_paymentId_idx" ON "payment_idempotency_keys"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_idempotency_keys_userId_key_key" ON "payment_idempotency_keys"("userId", "key");

-- AddForeignKey
ALTER TABLE "payment_idempotency_keys" ADD CONSTRAINT "payment_idempotency_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_idempotency_keys" ADD CONSTRAINT "payment_idempotency_keys_paymentShareId_fkey" FOREIGN KEY ("paymentShareId") REFERENCES "payment_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_idempotency_keys" ADD CONSTRAINT "payment_idempotency_keys_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
