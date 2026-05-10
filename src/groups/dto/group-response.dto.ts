import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class GroupResponseDto {
  @Expose()
  id!: string;

  @Expose()
  issuer!: string;

  @Expose()
  externalId!: string;

  @Expose()
  displayName!: string | null;

  @Expose()
  description!: string | null;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;
}
