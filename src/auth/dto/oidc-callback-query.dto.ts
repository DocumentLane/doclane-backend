import { IsNotEmpty, IsString } from 'class-validator';

export class OidcCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;
}
