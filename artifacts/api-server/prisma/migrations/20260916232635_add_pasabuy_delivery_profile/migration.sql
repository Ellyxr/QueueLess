-- AlterTable
ALTER TABLE "pasabuy_requests" ADD COLUMN     "acceptedAt" TIMESTAMPTZ(6),
ADD COLUMN     "cancelledAt" TIMESTAMPTZ(6),
ADD COLUMN     "deliveredAt" TIMESTAMPTZ(6),
ADD COLUMN     "pickedUpAt" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "pasabuy_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pasabuy_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pasabuy_profiles_userId_key" ON "pasabuy_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pasabuy_profiles_studentId_key" ON "pasabuy_profiles"("studentId");

-- AddForeignKey
ALTER TABLE "pasabuy_profiles" ADD CONSTRAINT "pasabuy_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
