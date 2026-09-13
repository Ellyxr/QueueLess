-- Rename OrderStatus enum value DELIVERED -> COMPLETED (in-place, preserves existing rows)
ALTER TYPE "OrderStatus" RENAME VALUE 'DELIVERED' TO 'COMPLETED';

-- Add new OrderStatus enum value for the self-pickup flow
ALTER TYPE "OrderStatus" ADD VALUE 'READY_FOR_PICKUP';

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('NOT_AVAILABLE', 'CUSTOMER_REQUEST', 'CLOSING_EARLY', 'OTHER');

-- AlterTable
ALTER TABLE "orders"
  ADD COLUMN "isPasabuyRequest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancellationReason" "CancellationReason",
  ADD COLUMN "cancellationNote" TEXT;
