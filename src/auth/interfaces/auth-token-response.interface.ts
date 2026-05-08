import { User } from '@prisma/client';
import { AuthTokenPair } from './auth-token-pair.interface';

export interface AuthTokenResponse extends AuthTokenPair {
  user: User;
}
