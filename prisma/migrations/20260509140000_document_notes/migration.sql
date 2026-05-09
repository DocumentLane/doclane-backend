CREATE TABLE "document_notes" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_notes_documentId_pageNumber_key" ON "document_notes"("documentId", "pageNumber");

CREATE INDEX "document_notes_documentId_idx" ON "document_notes"("documentId");

ALTER TABLE "document_notes" ADD CONSTRAINT "document_notes_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
