ALTER TABLE "payments" ADD COLUMN "checkoutUrl" TEXT;

-- One fee payment per Pasabuy request. Existing order-share payments keep NULL.
CREATE UNIQUE INDEX "payments_pasabuyRequestId_key" ON "payments" ("pasabuyRequestId");

-- Accepted requests from US-036 were never charged. Give them a new payment
-- window instead of letting the old pickup route bypass the fee.
UPDATE "pasabuy_requests"
SET "status" = 'AWAITING_PAYMENT',
    "paymentStatus" = 'AWAITING_PAYMENT',
    "paymentDeadline" = now() + interval '5 minutes'
WHERE "status" = 'ACCEPTED' AND "paymentStatus" = 'NOT_CHARGED';

INSERT INTO "pasabuy_status_history" ("id", "pasabuyRequestId", "status", "note", "changedAt")
SELECT gen_random_uuid(), "id", 'AWAITING_PAYMENT',
       'Waiting for requester to pay the Pasabuy fee', now()
FROM "pasabuy_requests"
WHERE "status" = 'AWAITING_PAYMENT' AND "paymentStatus" = 'AWAITING_PAYMENT'
  AND "paymentDeadline" > now()
  AND NOT EXISTS (
    SELECT 1 FROM "pasabuy_status_history" h
    WHERE h."pasabuyRequestId" = "pasabuy_requests"."id"
      AND h."status" = 'AWAITING_PAYMENT'
  );
