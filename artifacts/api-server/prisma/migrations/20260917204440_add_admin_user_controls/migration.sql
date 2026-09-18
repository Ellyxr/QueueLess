-- AlterTable
ALTER TABLE "users" ADD COLUMN     "archivedAt" TIMESTAMPTZ(6),
ADD COLUMN     "dataAccessGrantedAt" TIMESTAMPTZ(6);
