ALTER TABLE "document_bookmarks" ADD COLUMN "userId" TEXT;
ALTER TABLE "document_notes" ADD COLUMN "userId" TEXT;

UPDATE "document_bookmarks"
SET "userId" = "documents"."ownerId"
FROM "documents"
WHERE "document_bookmarks"."documentId" = "documents"."id";

UPDATE "document_notes"
SET "userId" = "documents"."ownerId"
FROM "documents"
WHERE "document_notes"."documentId" = "documents"."id";

ALTER TABLE "document_bookmarks" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "document_notes" ALTER COLUMN "userId" SET NOT NULL;

CREATE TABLE "document_reading_positions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadPageNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_reading_positions_pkey" PRIMARY KEY ("id")
);

INSERT INTO "document_reading_positions" ("id", "documentId", "userId", "lastReadPageNumber", "createdAt", "updatedAt")
SELECT "id" || ':' || "ownerId", "id", "ownerId", "lastReadPageNumber", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "documents"
WHERE "lastReadPageNumber" IS NOT NULL;

DROP INDEX "document_bookmarks_documentId_pageNumber_key";
DROP INDEX "document_notes_documentId_pageNumber_key";

CREATE UNIQUE INDEX "document_bookmarks_documentId_userId_pageNumber_key" ON "document_bookmarks"("documentId", "userId", "pageNumber");
CREATE INDEX "document_bookmarks_userId_idx" ON "document_bookmarks"("userId");
CREATE UNIQUE INDEX "document_notes_documentId_userId_pageNumber_key" ON "document_notes"("documentId", "userId", "pageNumber");
CREATE INDEX "document_notes_userId_idx" ON "document_notes"("userId");
CREATE UNIQUE INDEX "document_reading_positions_documentId_userId_key" ON "document_reading_positions"("documentId", "userId");
CREATE INDEX "document_reading_positions_userId_idx" ON "document_reading_positions"("userId");

ALTER TABLE "document_bookmarks" ADD CONSTRAINT "document_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_notes" ADD CONSTRAINT "document_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_reading_positions" ADD CONSTRAINT "document_reading_positions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_reading_positions" ADD CONSTRAINT "document_reading_positions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
