-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "preorderSameAsStoreHours" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "vendor_availability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendorId" UUID NOT NULL,
    "dayOfWeek" "Weekday" NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "openTime" VARCHAR(5),
    "closeTime" VARCHAR(5),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vendor_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_availability_vendorId_idx" ON "vendor_availability"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_availability_vendorId_dayOfWeek_key" ON "vendor_availability"("vendorId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "vendor_availability" ADD CONSTRAINT "vendor_availability_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
