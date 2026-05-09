import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class DocumentNoteResponseDto {
  @Expose()
  id!: string;

  @Expose()
  documentId!: string;

  @Expose()
  pageNumber!: number;

  @Expose()
  content!: string;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;
}
