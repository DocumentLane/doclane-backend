import { IsBoolean } from 'class-validator';

export class UpdateDocumentPublicAccessDto {
  @IsBoolean()
  isPublic!: boolean;
}
