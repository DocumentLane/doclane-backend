import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class FolderResponseDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;
}
