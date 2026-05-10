import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class DocumentThumbnailUploadSessionResponseDto {
  @Expose()
  documentId!: string;

  @Expose()
  uploadUrl!: string;

  @Expose()
  method!: 'PUT';

  @Expose()
  storageBucket!: string;

  @Expose()
  objectKey!: string;

  @Expose()
  contentType!: string;

  @Expose()
  @Type(() => Date)
  expiresAt!: Date;
}
