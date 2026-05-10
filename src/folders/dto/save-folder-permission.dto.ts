import { ResourcePermission } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SaveFolderPermissionDto {
  @IsEnum(ResourcePermission)
  permission!: ResourcePermission;
}
