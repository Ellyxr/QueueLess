CREATE TYPE "PasabuyFeeTier" AS ENUM ('IN_CAMPUS', 'OUTSIDE_CAMPUS');

ALTER TABLE "vendors"
  ADD COLUMN "pickupLocation" TEXT,
  ADD COLUMN "pickupLatitude" DOUBLE PRECISION,
  ADD COLUMN "pickupLongitude" DOUBLE PRECISION;

ALTER TABLE "pasabuy_requests"
  ADD COLUMN "feeTier" "PasabuyFeeTier",
  ADD COLUMN "deliveryDistanceMeters" INTEGER,
  ADD COLUMN "dropoffLatitude" DOUBLE PRECISION,
  ADD COLUMN "dropoffLongitude" DOUBLE PRECISION;

CREATE UNIQUE INDEX "pasabuy_one_active_request_per_order"
  ON "pasabuy_requests" ("relatedOrderId")
  WHERE "relatedOrderId" IS NOT NULL AND "status" NOT IN
    ('COMPLETED', 'CANCELLED', 'EXPIRED', 'PAYMENT_EXPIRED');
