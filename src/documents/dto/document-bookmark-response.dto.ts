import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class DocumentBookmarkResponseDto {
  @Expose()
  id!: string;

  @Expose()
  documentId!: string;

  @Expose()
  pageNumber!: number;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;
}
