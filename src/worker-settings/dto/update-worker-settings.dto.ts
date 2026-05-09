import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateWorkerSettingsDto {
  @IsOptional()
  @IsString()
  ocrLanguage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ocrDpi?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(13)
  ocrPsm?: number;

  @IsOptional()
  @IsBoolean()
  ocrPdfOutputEnabled?: boolean;
}
