import { Expose } from 'class-transformer';
import { UserRole } from '@prisma/client';

export class AuthenticatedUserResponseDto {
  @Expose()
  id!: string;

  @Expose()
  email!: string | null;

  @Expose()
  displayName!: string | null;

  @Expose()
  role!: UserRole;
}
