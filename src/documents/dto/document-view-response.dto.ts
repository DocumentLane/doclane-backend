import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class DocumentViewResponseDto {
  @Expose()
  documentId!: string;

  @Expose()
  viewUrl!: string;

  @Expose()
  expiresIn!: number;

  @Expose()
  isLinearized!: boolean;

  @Expose()
  linearizationStatus!: string;
}
