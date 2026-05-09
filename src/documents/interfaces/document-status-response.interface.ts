import { DocumentJob, DocumentOcrStatus, DocumentStatus } from '@prisma/client';

export interface DocumentStatusResponse {
  documentId: string;
  status: DocumentStatus;
  ocrStatus: DocumentOcrStatus;
  pageCount: number | null;
  hasTextLayer: boolean | null;
  jobs: DocumentJob[];
}
