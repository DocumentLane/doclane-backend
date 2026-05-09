import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class WorkerSettingsResponseDto {
  @Expose()
  id!: string;

  @Expose()
  ocrLanguage!: string;

  @Expose()
  ocrDpi!: number;

  @Expose()
  ocrPsm!: number;

  @Expose()
  ocrPdfOutputEnabled!: boolean;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;
}
