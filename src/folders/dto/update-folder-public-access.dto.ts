import { IsBoolean } from 'class-validator';

export class UpdateFolderPublicAccessDto {
  @IsBoolean()
  isPublic!: boolean;
}
