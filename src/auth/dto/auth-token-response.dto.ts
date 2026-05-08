import { Expose, Type } from 'class-transformer';
import { AuthenticatedUserResponseDto } from './authenticated-user-response.dto';

export class AuthTokenResponseDto {
  @Expose()
  accessToken!: string;

  @Expose()
  refreshToken!: string;

  @Expose()
  tokenType!: 'Bearer';

  @Expose()
  expiresIn!: number;

  @Expose()
  @Type(() => AuthenticatedUserResponseDto)
  user!: AuthenticatedUserResponseDto;
}
