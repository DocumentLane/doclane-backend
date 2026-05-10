import { ResourcePermission } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SaveResourcePermissionDto {
  @IsEnum(ResourcePermission)
  permission!: ResourcePermission;
}
