-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
    'AUTH_LOGIN',
    'AUTH_REFRESH',
    'DOCUMENT_CREATE_UPLOAD_SESSION',
    'DOCUMENT_COMPLETE_UPLOAD',
    'DOCUMENT_READ',
    'DOCUMENT_VIEW',
    'DOCUMENT_UPDATE',
    'DOCUMENT_DELETE',
    'DOCUMENT_PUBLIC_ACCESS_UPDATE',
    'DOCUMENT_PERMISSION_GRANT',
    'DOCUMENT_PERMISSION_REVOKE',
    'DOCUMENT_OCR_REPROCESS',
    'DOCUMENT_JOB_RESTART',
    'FOLDER_CREATE',
    'FOLDER_UPDATE',
    'FOLDER_DELETE',
    'FOLDER_PUBLIC_ACCESS_UPDATE',
    'FOLDER_PERMISSION_GRANT',
    'FOLDER_PERMISSION_REVOKE',
    'USER_UPDATE',
    'GROUP_CREATE',
    'GROUP_UPDATE',
    'WORKER_SETTINGS_UPDATE'
);

-- CreateEnum
CREATE TYPE "AuditResourceType" AS ENUM (
    'AUTH',
    'DOCUMENT',
    'FOLDER',
    'USER',
    'GROUP',
    'WORKER_SETTINGS'
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "resourceType" "AuditResourceType" NOT NULL,
    "resourceId" TEXT,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_createdAt_idx" ON "audit_logs"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
