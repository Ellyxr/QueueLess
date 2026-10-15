-- US-057: preorders carry the pickup time the student chose (nullable; only
-- set for preorders).

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "scheduledPickupAt" TIMESTAMPTZ(6);
