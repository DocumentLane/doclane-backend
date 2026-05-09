-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOAD_PENDING', 'UPLOADED', 'METADATA_PROCESSING', 'READY', 'PROCESSING_FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "DocumentOcrStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentJobType" AS ENUM ('PDF_METADATA', 'PDF_PAGE_DERIVATIVE', 'PDF_OCR');

-- CreateEnum
CREATE TYPE "DocumentJobStatus" AS ENUM ('QUEUED', 'ACTIVE', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentJobLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "DocumentPageDerivativeKind" AS ENUM ('THUMBNAIL', 'PREVIEW');

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sizeBytes" BIGINT,
    "checksumSha256" TEXT,
    "storageBucket" TEXT NOT NULL,
    "originalObjectKey" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOAD_PENDING',
    "ocrStatus" "DocumentOcrStatus" NOT NULL DEFAULT 'PENDING',
    "pageCount" INTEGER,
    "hasTextLayer" BOOLEAN,
    "uploadExpiresAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "metadataExtractedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_pages" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "hasTextLayer" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_page_derivatives" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "kind" "DocumentPageDerivativeKind" NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_page_derivatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_page_ocr" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "language" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_page_ocr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_jobs" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "type" "DocumentJobType" NOT NULL,
    "status" "DocumentJobStatus" NOT NULL DEFAULT 'QUEUED',
    "queueName" TEXT NOT NULL,
    "bullJobId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB,
    "result" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_job_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" "DocumentJobLogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_originalObjectKey_key" ON "documents"("originalObjectKey");

-- CreateIndex
CREATE INDEX "documents_ownerId_createdAt_idx" ON "documents"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_ocrStatus_idx" ON "documents"("ocrStatus");

-- CreateIndex
CREATE INDEX "document_pages_documentId_idx" ON "document_pages"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_pages_documentId_pageNumber_key" ON "document_pages"("documentId", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "document_page_derivatives_objectKey_key" ON "document_page_derivatives"("objectKey");

-- CreateIndex
CREATE INDEX "document_page_derivatives_kind_idx" ON "document_page_derivatives"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "document_page_derivatives_pageId_kind_key" ON "document_page_derivatives"("pageId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "document_page_ocr_pageId_key" ON "document_page_ocr"("pageId");

-- CreateIndex
CREATE INDEX "document_jobs_documentId_type_idx" ON "document_jobs"("documentId", "type");

-- CreateIndex
CREATE INDEX "document_jobs_status_queuedAt_idx" ON "document_jobs"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "document_jobs_queueName_status_idx" ON "document_jobs"("queueName", "status");

-- CreateIndex
CREATE INDEX "document_job_logs_jobId_createdAt_idx" ON "document_job_logs"("jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_page_derivatives" ADD CONSTRAINT "document_page_derivatives_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "document_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_page_ocr" ADD CONSTRAINT "document_page_ocr_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "document_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_jobs" ADD CONSTRAINT "document_jobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_job_logs" ADD CONSTRAINT "document_job_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "document_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
