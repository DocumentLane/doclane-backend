import { ResourcePermission } from '@prisma/client';
import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
class FolderPermissionUserResponseDto {
  @Expose()
  id!: string;

  @Expose()
  email!: string | null;

  @Expose()
  displayName!: string | null;
}

@Exclude()
class FolderPermissionGroupResponseDto {
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
export class FolderPermissionResponseDto {
  @Expose()
  id!: string;

  @Expose()
  userId!: string | null;

  @Expose()
  groupId!: string | null;

  @Expose()
  permission!: ResourcePermission;

  @Expose()
  @Type(() => FolderPermissionUserResponseDto)
  user?: FolderPermissionUserResponseDto | null;

  @Expose()
  @Type(() => FolderPermissionGroupResponseDto)
  group?: FolderPermissionGroupResponseDto | null;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;
}
