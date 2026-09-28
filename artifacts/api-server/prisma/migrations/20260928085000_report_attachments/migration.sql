ALTER TABLE "reports"
  ADD COLUMN "targetType" VARCHAR(20),
  ADD COLUMN "attachmentPath" TEXT,
  ADD COLUMN "attachmentFileId" TEXT,
  ADD COLUMN "attachmentName" TEXT,
  ADD COLUMN "attachmentMimeType" TEXT,
  ADD COLUMN "attachmentSize" INTEGER;
