ALTER TABLE "orders" ADD COLUMN "isPreorder" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "pasabuy_requests"
  ADD COLUMN "pickupVerifiedAt" TIMESTAMPTZ(6),
  ADD COLUMN "pickupVerificationAttempts" INTEGER NOT NULL DEFAULT 0;

-- Keep in-flight paid requests usable after deploying vendor verification.
UPDATE "pasabuy_requests"
SET "pickupCode" = (100000 + floor(random() * 900000)::integer)::text
WHERE "pickupCode" IS NULL
  AND "status" = 'PAID'
  AND "paymentStatus" = 'PAID';
