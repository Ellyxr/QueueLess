ALTER TABLE "vendor_subscriptions"
  ALTER COLUMN "startDate" DROP NOT NULL,
  ALTER COLUMN "endDate" DROP NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE UNIQUE INDEX "vendor_subscriptions_one_current_per_vendor"
  ON "vendor_subscriptions" ("vendorId")
  WHERE "status" IN ('PENDING', 'ACTIVE');

CREATE UNIQUE INDEX "payments_one_per_vendor_subscription"
  ON "payments" ("vendorSubscriptionId")
  WHERE "vendorSubscriptionId" IS NOT NULL;
