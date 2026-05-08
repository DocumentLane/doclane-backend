import { Expose } from 'class-transformer';

export class OidcAuthorizationResponseDto {
  @Expose()
  authorizationUrl!: string;
}
