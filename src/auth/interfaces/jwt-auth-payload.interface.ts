import { UserRole } from '@prisma/client';

export interface JwtAuthPayload {
  sub: string;
  role: UserRole;
}
