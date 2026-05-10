import { AuditAction, AuditResourceType, Prisma } from '@prisma/client';
import { AuditRequestMetadata } from './audit-request-metadata.interface';

export interface AuditLogRecord extends AuditRequestMetadata {
  actorId?: string | null;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string | null;
  summary?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}
