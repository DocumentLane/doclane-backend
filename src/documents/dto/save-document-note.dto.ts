import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SaveDocumentNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content!: string;
}
