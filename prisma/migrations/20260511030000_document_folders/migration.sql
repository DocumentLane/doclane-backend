CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "documents" ADD COLUMN "folderId" TEXT;

CREATE UNIQUE INDEX "folders_ownerId_name_key" ON "folders"("ownerId", "name");
CREATE INDEX "folders_ownerId_createdAt_idx" ON "folders"("ownerId", "createdAt");
CREATE INDEX "documents_ownerId_folderId_createdAt_idx" ON "documents"("ownerId", "folderId", "createdAt");

ALTER TABLE "folders" ADD CONSTRAINT "folders_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
