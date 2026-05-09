CREATE TYPE "DocumentLinearizationStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'UNAVAILABLE', 'FAILED');

ALTER TABLE "documents"
ADD COLUMN "linearizedObjectKey" TEXT,
ADD COLUMN "linearizedSizeBytes" BIGINT,
ADD COLUMN "linearizedAt" TIMESTAMP(3),
ADD COLUMN "linearizationStatus" "DocumentLinearizationStatus" NOT NULL DEFAULT 'UNAVAILABLE',
ADD COLUMN "ocrLinearized" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "documents_linearizedObjectKey_key" ON "documents"("linearizedObjectKey");
CREATE INDEX "documents_linearizationStatus_idx" ON "documents"("linearizationStatus");

ALTER TABLE "documents"
ALTER COLUMN "linearizationStatus" SET DEFAULT 'PENDING';
