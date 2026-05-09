import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class DocumentPreviewResponseDto {
  @Expose()
  documentId!: string;

  @Expose()
  previewUrl!: string;

  @Expose()
  contentType!: string;

  @Expose()
  width!: number | null;

  @Expose()
  height!: number | null;

  @Expose()
  expiresIn!: number;
}
