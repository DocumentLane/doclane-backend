import { DocumentOcrStatus, DocumentStatus } from '@prisma/client';
import { Exclude, Expose, Transform, Type } from 'class-transformer';

@Exclude()
class DocumentPageResponseDto {
  @Expose()
  id!: string;

  @Expose()
  pageNumber!: number;

  @Expose()
  width!: number;

  @Expose()
  height!: number;

  @Expose()
  rotation!: number;

  @Expose()
  hasTextLayer!: boolean | null;
}

@Exclude()
export class DocumentResponseDto {
  @Expose()
  id!: string;

  @Expose()
  title!: string;

  @Expose()
  originalFileName!: string;

  @Expose()
  folderId!: string | null;

  @Expose()
  contentType!: string;

  @Expose()
  @Transform(
    ({ obj }: { obj: { sizeBytes: bigint | null } }) =>
      obj.sizeBytes?.toString() ?? null,
  )
  sizeBytes!: string | null;

  @Expose()
  status!: DocumentStatus;

  @Expose()
  ocrStatus!: DocumentOcrStatus;

  @Expose()
  isPublic!: boolean;

  @Expose()
  pageCount!: number | null;

  @Expose()
  lastReadPageNumber!: number | null;

  @Expose()
  hasTextLayer!: boolean | null;

  @Expose()
  @Type(() => Date)
  uploadExpiresAt!: Date | null;

  @Expose()
  @Type(() => Date)
  uploadedAt!: Date | null;

  @Expose()
  @Type(() => Date)
  metadataExtractedAt!: Date | null;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;

  @Expose()
  @Type(() => DocumentPageResponseDto)
  pages?: DocumentPageResponseDto[];
}
