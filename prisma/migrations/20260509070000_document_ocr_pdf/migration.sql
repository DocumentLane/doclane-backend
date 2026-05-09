ALTER TABLE "documents"
ADD COLUMN "ocrObjectKey" TEXT,
ADD COLUMN "ocrSizeBytes" BIGINT,
ADD COLUMN "ocrChecksumSha256" TEXT,
ADD COLUMN "ocrCompletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "documents_ocrObjectKey_key" ON "documents"("ocrObjectKey");
