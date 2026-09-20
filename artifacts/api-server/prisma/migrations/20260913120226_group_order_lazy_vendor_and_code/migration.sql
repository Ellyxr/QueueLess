-- DropForeignKey
ALTER TABLE "group_orders" DROP CONSTRAINT "group_orders_vendorId_fkey";

-- AlterTable
ALTER TABLE "group_orders"
  ADD COLUMN     "code" VARCHAR(8),
  ALTER COLUMN "vendorId" DROP NOT NULL;

-- Backfill existing rows with a deterministic unique code derived from their id
UPDATE "group_orders" SET "code" = upper(substr(replace(id::text, '-', ''), 1, 6));

ALTER TABLE "group_orders" ALTER COLUMN "code" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "allowParticipantOrderCompletion" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "group_orders_code_key" ON "group_orders"("code");

-- AddForeignKey
ALTER TABLE "group_orders" ADD CONSTRAINT "group_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
