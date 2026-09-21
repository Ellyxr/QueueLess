-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "preorderEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "vendor_preorder_availability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendorId" UUID NOT NULL,
    "dayOfWeek" "Weekday" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "openTime" VARCHAR(5),
    "closeTime" VARCHAR(5),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vendor_preorder_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_preorder_availability_vendorId_idx" ON "vendor_preorder_availability"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_preorder_availability_vendorId_dayOfWeek_key" ON "vendor_preorder_availability"("vendorId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "vendor_preorder_availability" ADD CONSTRAINT "vendor_preorder_availability_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
