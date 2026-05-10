import {
  DocumentJobStatus,
  DocumentJobType,
  DocumentOcrStatus,
  DocumentStatus,
} from '@prisma/client';

export interface DocumentJobStatusSummary {
  id: string;
  type: DocumentJobType;
  status: DocumentJobStatus;
  attempts: number;
  maxAttempts: number;
  progressPercent: number;
  currentPageNumber: number | null;
  completedPages: number;
  totalPages: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface DocumentStatusResponse {
  documentId: string;
  status: DocumentStatus;
  ocrStatus: DocumentOcrStatus;
  pageCount: number | null;
  hasTextLayer: boolean | null;
  jobs: DocumentJobStatusSummary[];
}
