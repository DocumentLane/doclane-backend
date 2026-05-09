import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateDocumentReadingPositionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber!: number;
}
