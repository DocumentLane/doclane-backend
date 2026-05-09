import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class DocumentUploadSessionResponseDto {
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
  contentType!: 'application/pdf';

  @Expose()
  @Type(() => Date)
  expiresAt!: Date;
}
