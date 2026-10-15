-- Admin master switch for the featured-listing introductory (1st-3rd vendor) discount.

-- AlterTable
ALTER TABLE "featured_listing_settings" ADD COLUMN     "introDiscountEnabled" BOOLEAN NOT NULL DEFAULT true;

