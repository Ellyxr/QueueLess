-- CreateTable
CREATE TABLE "order_idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "cartId" UUID NOT NULL,
    "eventId" UUID,
    "orderId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_idempotency_keys_userId_key_key"
ON "order_idempotency_keys"("userId", "key");

-- CreateIndex
CREATE INDEX "order_idempotency_keys_orderId_idx"
ON "order_idempotency_keys"("orderId");

-- AddForeignKey
ALTER TABLE "order_idempotency_keys"
ADD CONSTRAINT "order_idempotency_keys_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_idempotency_keys"
ADD CONSTRAINT "order_idempotency_keys_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
