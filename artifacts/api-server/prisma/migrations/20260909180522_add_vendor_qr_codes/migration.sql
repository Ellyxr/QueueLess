-- CreateTable
CREATE TABLE "vendor_qr_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendorId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vendor_qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_qr_codes_token_key" ON "vendor_qr_codes"("token");

-- CreateIndex
CREATE INDEX "vendor_qr_codes_vendorId_idx" ON "vendor_qr_codes"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_qr_codes_isActive_idx" ON "vendor_qr_codes"("isActive");

-- AddForeignKey
ALTER TABLE "vendor_qr_codes" ADD CONSTRAINT "vendor_qr_codes_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
