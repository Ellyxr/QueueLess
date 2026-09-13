-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "categoryOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
