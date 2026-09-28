CREATE TYPE "FeeAssessmentType" AS ENUM ('MARKETPLACE_MARKUP', 'PASABUY_CONVENIENCE');

CREATE TABLE "fee_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "FeeAssessmentType" NOT NULL,
    "orderId" UUID,
    "pasabuyRequestId" UUID,
    "basisAmount" DECIMAL(10,2),
    "ratePercent" DECIMAL(10,6),
    "amount" DECIMAL(10,2) NOT NULL,
    "feeTier" "PasabuyFeeTier",
    "distanceMeters" INTEGER,
    "ruleVersion" TEXT NOT NULL,
    "assessedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fee_assessments_target_check" CHECK (
      ("type" = 'MARKETPLACE_MARKUP' AND "orderId" IS NOT NULL AND "pasabuyRequestId" IS NULL)
      OR ("type" = 'PASABUY_CONVENIENCE' AND "orderId" IS NULL AND "pasabuyRequestId" IS NOT NULL)
    ),
    CONSTRAINT "fee_assessments_amount_check" CHECK ("amount" >= 0),
    CONSTRAINT "fee_assessments_rate_check" CHECK ("ratePercent" IS NULL OR "ratePercent" BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX "fee_assessments_orderId_key" ON "fee_assessments"("orderId");
CREATE UNIQUE INDEX "fee_assessments_pasabuyRequestId_key" ON "fee_assessments"("pasabuyRequestId");
CREATE INDEX "fee_assessments_type_assessedAt_idx" ON "fee_assessments"("type", "assessedAt");
ALTER TABLE "fee_assessments" ADD CONSTRAINT "fee_assessments_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_assessments" ADD CONSTRAINT "fee_assessments_pasabuyRequestId_fkey"
  FOREIGN KEY ("pasabuyRequestId") REFERENCES "pasabuy_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Historical assessments snapshot persisted amounts. The original configured
-- percentage cannot be reconstructed reliably, so its rate remains NULL.
INSERT INTO "fee_assessments" ("type", "orderId", "basisAmount", "amount", "ruleVersion", "assessedAt")
SELECT 'MARKETPLACE_MARKUP', "id", "subtotal", "marketplaceFee", 'LEGACY_ORDER_SNAPSHOT', "createdAt"
FROM "orders";

INSERT INTO "fee_assessments" ("type", "pasabuyRequestId", "amount", "feeTier", "distanceMeters", "ruleVersion", "assessedAt")
SELECT 'PASABUY_CONVENIENCE', "id", "convenienceFee", "feeTier", "deliveryDistanceMeters", 'LEGACY_PASABUY_SNAPSHOT', "createdAt"
FROM "pasabuy_requests";

-- Assessment snapshots never change when a payment is refunded or cancelled.
-- Payment and refund tables retain the separate cash-flow history.
CREATE FUNCTION "prevent_fee_assessment_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Fee assessments are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "fee_assessments_immutable"
BEFORE UPDATE OR DELETE ON "fee_assessments"
FOR EACH ROW EXECUTE FUNCTION "prevent_fee_assessment_change"();
