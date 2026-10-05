CREATE TABLE "featured_listing_settings" (
 "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
 "monthlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 100 CHECK ("monthlyPrice" >= 1 AND "monthlyPrice" <= 100000),
 "firstVendorDiscount" INTEGER NOT NULL DEFAULT 30 CHECK ("firstVendorDiscount" BETWEEN 0 AND 99),
 "secondVendorDiscount" INTEGER NOT NULL DEFAULT 20 CHECK ("secondVendorDiscount" BETWEEN 0 AND 99),
 "thirdVendorDiscount" INTEGER NOT NULL DEFAULT 10 CHECK ("thirdVendorDiscount" BETWEEN 0 AND 99),
 "discountOnRenewals" BOOLEAN NOT NULL DEFAULT true,
 "version" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO "featured_listing_settings" ("id") VALUES (1);
ALTER TABLE "featured_listing_plans" ADD COLUMN "durationMonths" INTEGER CHECK ("durationMonths" BETWEEN 1 AND 12), ADD COLUMN "managedMonthly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "featured_listings" ADD COLUMN "durationDaysSnapshot" INTEGER, ADD COLUMN "durationMonthsSnapshot" INTEGER, ADD COLUMN "settingsVersion" INTEGER, ADD COLUMN "purchaseKey" VARCHAR(255), ADD COLUMN "purchaseFingerprint" TEXT;
UPDATE "featured_listings" f SET "durationDaysSnapshot" = p."durationDays" FROM "featured_listing_plans" p WHERE f."planId" = p.id;
CREATE UNIQUE INDEX "featured_listings_vendorId_purchaseKey_key" ON "featured_listings" ("vendorId", "purchaseKey");
CREATE TABLE "featured_intro_claims" (
 "vendorId" UUID PRIMARY KEY REFERENCES "vendors"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "rank" INTEGER NOT NULL UNIQUE CHECK ("rank" BETWEEN 1 AND 3),
 "consumedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Preserve the first three distinct vendors who actually paid, including cancelled/refunded listings.
INSERT INTO "featured_intro_claims" ("vendorId", "rank", "consumedAt")
SELECT "vendorId", row_number() OVER (ORDER BY first_paid, "vendorId"), first_paid
FROM (SELECT f."vendorId", min(p."createdAt") first_paid FROM "featured_listings" f
JOIN "payments" p ON p."featuredListingId" = f.id
WHERE f.placement = 'MARKETPLACE_HOME' AND p.status = 'SUCCEEDED'
GROUP BY f."vendorId" ORDER BY first_paid, f."vendorId" LIMIT 3) paid;
-- Honor still-open legacy reservations before offering unused slots to new vendors.
WITH pending AS (
 SELECT f."vendorId", min(f."createdAt") first_reserved FROM "featured_listings" f
 WHERE f.placement = 'MARKETPLACE_HOME' AND f.status = 'PENDING' AND f."discountPercent" > 0
 AND NOT EXISTS (SELECT 1 FROM "featured_intro_claims" c WHERE c."vendorId" = f."vendorId")
 GROUP BY f."vendorId"
), candidates AS (
 SELECT "vendorId", row_number() OVER (ORDER BY first_reserved, "vendorId") seq FROM pending
), free_slots AS (
 SELECT n rank, row_number() OVER (ORDER BY n) seq FROM generate_series(1,3) n
 WHERE NOT EXISTS (SELECT 1 FROM "featured_intro_claims" c WHERE c.rank = n)
)
INSERT INTO "featured_intro_claims" ("vendorId", rank)
SELECT c."vendorId", f.rank FROM candidates c JOIN free_slots f USING (seq);
INSERT INTO "featured_listing_plans" (id, name, placement, price, "durationDays", "durationMonths", "managedMonthly", "isActive")
SELECT ('13600000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 'Marketplace home — ' || n || ' month' || CASE WHEN n=1 THEN '' ELSE 's' END,
 'MARKETPLACE_HOME', 100*n, 30*n, n, true, true FROM generate_series(1,12) n;
ALTER TABLE "vendor_ledger_entries" ADD COLUMN "featuredListingId" UUID REFERENCES "featured_listings"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "vendor_ledger_entries_featuredListingId_key" ON "vendor_ledger_entries" ("featuredListingId");
ALTER TABLE "reports" ADD COLUMN "vendorNotice" TEXT;
CREATE TABLE "report_vendor_responses" (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "reportId" UUID NOT NULL REFERENCES reports(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "vendorId" UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "authorUserId" UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE, kind VARCHAR(10) NOT NULL CHECK (kind IN ('RESPONSE','APPEAL')),
 body VARCHAR(2000) NOT NULL, status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
 "reviewedByUserId" UUID REFERENCES users(id) ON UPDATE CASCADE, "reviewNote" VARCHAR(2000), "reviewedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT "report_vendor_responses_reportId_vendorId_kind_key" UNIQUE ("reportId", "vendorId", kind)
);
CREATE INDEX "report_vendor_responses_vendorId_createdAt_idx" ON "report_vendor_responses" ("vendorId", "createdAt");
