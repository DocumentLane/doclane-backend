import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateDocumentUploadSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  originalFileName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  checksumSha256?: string;

  @ValidateIf((_, value: unknown) => value !== null && value !== undefined)
  @IsUUID()
  folderId?: string | null;
}
