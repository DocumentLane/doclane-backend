import { Request } from 'express';
import { JwtAuthPayload } from './jwt-auth-payload.interface';

export interface AuthenticatedRequest extends Request {
  user: JwtAuthPayload;
}
