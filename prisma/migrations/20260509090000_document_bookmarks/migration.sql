CREATE TABLE "document_bookmarks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_bookmarks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_bookmarks_documentId_pageNumber_key" ON "document_bookmarks"("documentId", "pageNumber");
CREATE INDEX "document_bookmarks_documentId_idx" ON "document_bookmarks"("documentId");

ALTER TABLE "document_bookmarks" ADD CONSTRAINT "document_bookmarks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
