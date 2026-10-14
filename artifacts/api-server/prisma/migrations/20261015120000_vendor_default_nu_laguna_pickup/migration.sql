-- Vendors default to the NU Laguna campus pickup point (centre of PASABUY_CAMPUS_BOUNDS).
ALTER TABLE "vendors"
  ALTER COLUMN "pickupLocation" SET DEFAULT 'NU Laguna',
  ALTER COLUMN "pickupLatitude" SET DEFAULT 14.17841,
  ALTER COLUMN "pickupLongitude" SET DEFAULT 121.136249;

-- Backfill vendors that never set a pickup point so Pasabuy requests can be created for them.
UPDATE "vendors"
SET "pickupLocation" = COALESCE(NULLIF(BTRIM("pickupLocation"), ''), 'NU Laguna'),
    "pickupLatitude" = 14.17841,
    "pickupLongitude" = 121.136249
WHERE "pickupLatitude" IS NULL OR "pickupLongitude" IS NULL OR "pickupLocation" IS NULL OR BTRIM("pickupLocation") = '';
