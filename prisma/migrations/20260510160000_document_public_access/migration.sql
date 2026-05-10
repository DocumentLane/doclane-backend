ALTER TABLE "documents" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "documents_isPublic_status_idx" ON "documents"("isPublic", "status");
