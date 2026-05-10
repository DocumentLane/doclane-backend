import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
