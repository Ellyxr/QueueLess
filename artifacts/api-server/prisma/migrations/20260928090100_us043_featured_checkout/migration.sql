CREATE TYPE "FeaturedListingPlacement" AS ENUM ('MARKETPLACE_HOME', 'VENDOR_DIRECTORY', 'PRODUCT_SPOTLIGHT');

CREATE TABLE "featured_listing_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "placement" "FeaturedListingPlacement" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "featured_listing_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "featured_listing_plans_price_check" CHECK ("price" >= 1),
    CONSTRAINT "featured_listing_plans_duration_check" CHECK ("durationDays" BETWEEN 1 AND 365)
);
CREATE UNIQUE INDEX "featured_listing_plans_name_key" ON "featured_listing_plans"("name");
CREATE INDEX "featured_listing_plans_placement_isActive_idx" ON "featured_listing_plans"("placement", "isActive");

ALTER TABLE "featured_listings"
    ADD COLUMN "planId" UUID,
    ADD COLUMN "placement" "FeaturedListingPlacement" NOT NULL DEFAULT 'MARKETPLACE_HOME',
    ALTER COLUMN "startDate" DROP NOT NULL,
    ALTER COLUMN "endDate" DROP NOT NULL,
    ALTER COLUMN "pricePaid" DROP NOT NULL,
    ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "featured_listings" ADD CONSTRAINT "featured_listings_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "featured_listing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "featured_listings_placement_status_endDate_idx"
    ON "featured_listings"("placement", "status", "endDate");
-- Run the US-043 preflight first. A vendor may have one pending or active listing per placement.
CREATE UNIQUE INDEX "featured_listings_one_current_per_placement"
    ON "featured_listings"("vendorId", "placement") WHERE "status" IN ('PENDING', 'ACTIVE');
CREATE UNIQUE INDEX "payments_one_per_featured_listing"
    ON "payments"("featuredListingId") WHERE "featuredListingId" IS NOT NULL;
