import { AuditAction, AuditResourceType, UserRole } from '@prisma/client';
import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
class AuditLogActorResponseDto {
  @Expose()
  id!: string;

  @Expose()
  email!: string | null;

  @Expose()
  displayName!: string | null;

  @Expose()
  role!: UserRole;
}

@Exclude()
export class AuditLogResponseDto {
  @Expose()
  id!: string;

  @Expose()
  actorId!: string | null;

  @Expose()
  action!: AuditAction;

  @Expose()
  resourceType!: AuditResourceType;

  @Expose()
  resourceId!: string | null;

  @Expose()
  summary!: string | null;

  @Expose()
  before!: unknown;

  @Expose()
  after!: unknown;

  @Expose()
  ipAddress!: string | null;

  @Expose()
  userAgent!: string | null;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => AuditLogActorResponseDto)
  actor?: AuditLogActorResponseDto | null;
}
