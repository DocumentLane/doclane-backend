import { UserRole } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  groupIds?: string[];
}
