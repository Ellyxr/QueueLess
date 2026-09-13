-- CreateTable
CREATE TABLE "vendor_favorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_favorites_vendorId_idx" ON "vendor_favorites"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_favorites_userId_vendorId_key" ON "vendor_favorites"("userId", "vendorId");

-- AddForeignKey
ALTER TABLE "vendor_favorites" ADD CONSTRAINT "vendor_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_favorites" ADD CONSTRAINT "vendor_favorites_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
