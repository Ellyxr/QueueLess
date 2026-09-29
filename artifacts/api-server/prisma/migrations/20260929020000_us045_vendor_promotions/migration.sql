-- US-045: vendor promotions (deals banner + marketplace promo card discount/wallet/custom-image)

CREATE TYPE "DealDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
CREATE TYPE "DealTriggerType" AS ENUM ('NONE', 'MIN_QUANTITY', 'MIN_ORDER_AMOUNT');

CREATE TABLE "deals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendorId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "discountType" "DealDiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "triggerType" "DealTriggerType" NOT NULL DEFAULT 'NONE',
    "triggerValue" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "deals_discount_value_check" CHECK (
      ("discountType" = 'PERCENTAGE' AND "discountValue" BETWEEN 1 AND 100)
      OR ("discountType" = 'FIXED_AMOUNT' AND "discountValue" > 0)
    ),
    CONSTRAINT "deals_trigger_value_check" CHECK (
      ("triggerType" = 'NONE' AND "triggerValue" IS NULL)
      OR ("triggerType" != 'NONE' AND "triggerValue" IS NOT NULL AND "triggerValue" > 0)
    )
);
CREATE INDEX "deals_vendorId_idx" ON "deals"("vendorId");
CREATE INDEX "deals_productId_idx" ON "deals"("productId");
CREATE INDEX "deals_isActive_idx" ON "deals"("isActive");
ALTER TABLE "deals" ADD CONSTRAINT "deals_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "featured_listings"
    ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "featured_listings" ADD CONSTRAINT "featured_listings_discount_check"
    CHECK ("discountPercent" BETWEEN 0 AND 100);

ALTER TYPE "PaymentProvider" ADD VALUE 'WALLET';
ALTER TYPE "LedgerEntryType" ADD VALUE 'PROMOTION_DEBIT';
