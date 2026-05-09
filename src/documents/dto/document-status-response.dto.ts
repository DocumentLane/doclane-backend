import {
  DocumentJobStatus,
  DocumentJobType,
  DocumentOcrStatus,
  DocumentStatus,
} from '@prisma/client';
import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
class DocumentJobStatusResponseDto {
  @Expose()
  id!: string;

  @Expose()
  type!: DocumentJobType;

  @Expose()
  status!: DocumentJobStatus;

  @Expose()
  attempts!: number;

  @Expose()
  maxAttempts!: number;

  @Expose()
  progressPercent!: number;

  @Expose()
  currentPageNumber!: number | null;

  @Expose()
  completedPages!: number;

  @Expose()
  totalPages!: number | null;

  @Expose()
  errorCode!: string | null;

  @Expose()
  errorMessage!: string | null;

  @Expose()
  @Type(() => Date)
  queuedAt!: Date;

  @Expose()
  @Type(() => Date)
  startedAt!: Date | null;

  @Expose()
  @Type(() => Date)
  completedAt!: Date | null;
}

@Exclude()
export class DocumentStatusResponseDto {
  @Expose()
  documentId!: string;

  @Expose()
  status!: DocumentStatus;

  @Expose()
  ocrStatus!: DocumentOcrStatus;

  @Expose()
  pageCount!: number | null;

  @Expose()
  hasTextLayer!: boolean | null;

  @Expose()
  @Type(() => DocumentJobStatusResponseDto)
  jobs!: DocumentJobStatusResponseDto[];
}
