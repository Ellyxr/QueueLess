-- CreateEnum
CREATE TYPE "VendorApplicationStatus" AS ENUM ('PENDING_REVIEW', 'REJECTED', 'AWAITING_CONTRACT', 'CONTRACT_SUBMITTED', 'CONTRACT_REJECTED', 'CONTRACT_EXPIRED', 'PAYMENT_PROCESSING', 'PAYMENT_FAILED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "VendorApplicationDocumentKind" AS ENUM ('VALID_ID', 'ID_SELFIE', 'SIGNED_CONTRACT');

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "durationMonths" INTEGER,
ADD COLUMN     "studentApplicationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "vendor_application_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerUserId" UUID NOT NULL,
    "kind" "VendorApplicationDocumentKind" NOT NULL,
    "fileId" TEXT NOT NULL,
    "privatePath" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studentUserId" UUID NOT NULL,
    "businessName" VARCHAR(100) NOT NULL,
    "foodCategory" VARCHAR(100) NOT NULL,
    "validIdDocumentId" UUID NOT NULL,
    "idSelfieDocumentId" UUID NOT NULL,
    "signedContractDocumentId" UUID,
    "bankDetailsEncrypted" TEXT NOT NULL,
    "bankAccountLast4" VARCHAR(4) NOT NULL,
    "planId" UUID NOT NULL,
    "quotedPrice" DECIMAL(10,2) NOT NULL,
    "quotedDurationDays" INTEGER NOT NULL,
    "quotedDurationMonths" INTEGER,
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "VendorApplicationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReason" TEXT,
    "contractRejectionReason" TEXT,
    "paymentFailureReason" TEXT,
    "contractDueAt" TIMESTAMPTZ(6),
    "contractVerifiedAt" TIMESTAMPTZ(6),
    "vendorId" UUID,
    "subscriptionId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vendor_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_application_documents_fileId_key" ON "vendor_application_documents"("fileId");

-- CreateIndex
CREATE INDEX "vendor_application_documents_ownerUserId_createdAt_idx" ON "vendor_application_documents"("ownerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_applications_validIdDocumentId_key" ON "vendor_applications"("validIdDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_applications_idSelfieDocumentId_key" ON "vendor_applications"("idSelfieDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_applications_signedContractDocumentId_key" ON "vendor_applications"("signedContractDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_applications_subscriptionId_key" ON "vendor_applications"("subscriptionId");

-- CreateIndex
CREATE INDEX "vendor_applications_studentUserId_createdAt_idx" ON "vendor_applications"("studentUserId", "createdAt");

-- CreateIndex
CREATE INDEX "vendor_applications_status_createdAt_idx" ON "vendor_applications"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "vendor_application_documents" ADD CONSTRAINT "vendor_application_documents_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "vendor_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_validIdDocumentId_fkey" FOREIGN KEY ("validIdDocumentId") REFERENCES "vendor_application_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_idSelfieDocumentId_fkey" FOREIGN KEY ("idSelfieDocumentId") REFERENCES "vendor_application_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_signedContractDocumentId_fkey" FOREIGN KEY ("signedContractDocumentId") REFERENCES "vendor_application_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;


CREATE UNIQUE INDEX "vendor_applications_one_live_per_student"
ON "vendor_applications" ("studentUserId")
WHERE "status" NOT IN ('REJECTED', 'CONTRACT_EXPIRED');
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_application_positive_quote"
CHECK ("quotedPrice" >= 1 AND "quotedDurationDays" > 0 AND
  ("quotedDurationMonths" IS NULL OR "quotedDurationMonths" > 0));
ALTER TABLE "vendor_application_documents" ADD CONSTRAINT "vendor_application_private_path"
CHECK ("privatePath" LIKE '/vendor-application-documents/%');

-- Application-only plans; no existing plans are overwritten.
INSERT INTO "subscription_plans" ("id", "name", "price", "durationDays", "durationMonths", "studentApplicationEnabled", "benefitsDescription") VALUES
('13100000-0000-4000-8000-000000000001', 'Student vendor — 1 month', 40, 30, 1, true, '1 calendar month'),
('13100000-0000-4000-8000-000000000006', 'Student vendor — 6 months', 150, 180, 6, true, '5 + 1 month free; 6 calendar months'),
('13100000-0000-4000-8000-000000000012', 'Student vendor — 1 year', 200, 365, 12, true, '11 + 1 month free; 12 calendar months');
