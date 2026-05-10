import { ResourcePermission } from '@prisma/client';
import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
class PermissionUserResponseDto {
  @Expose()
  id!: string;

  @Expose()
  email!: string | null;

  @Expose()
  displayName!: string | null;
}

@Exclude()
class PermissionGroupResponseDto {
  @Expose()
  id!: string;

  @Expose()
  externalId!: string;

  @Expose()
  displayName!: string | null;

  @Expose()
  description!: string | null;
}

@Exclude()
export class ResourcePermissionResponseDto {
  @Expose()
  id!: string;

  @Expose()
  userId!: string | null;

  @Expose()
  groupId!: string | null;

  @Expose()
  permission!: ResourcePermission;

  @Expose()
  @Type(() => PermissionUserResponseDto)
  user?: PermissionUserResponseDto | null;

  @Expose()
  @Type(() => PermissionGroupResponseDto)
  group?: PermissionGroupResponseDto | null;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;
}

@Exclude()
export class DocumentPermissionsResponseDto {
  @Expose()
  @Type(() => ResourcePermissionResponseDto)
  direct!: ResourcePermissionResponseDto[];

  @Expose()
  @Type(() => ResourcePermissionResponseDto)
  inheritedFromFolder!: ResourcePermissionResponseDto[];
}
