import { UserRole } from '@prisma/client';
import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
class UserGroupResponseDto {
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
class UserGroupMembershipResponseDto {
  @Expose()
  id!: string;

  @Expose()
  groupId!: string;

  @Expose()
  @Type(() => UserGroupResponseDto)
  group!: UserGroupResponseDto;
}

@Exclude()
export class UserResponseDto {
  @Expose()
  id!: string;

  @Expose()
  email!: string | null;

  @Expose()
  displayName!: string | null;

  @Expose()
  role!: UserRole;

  @Expose()
  @Type(() => Date)
  groupsInitializedAt!: Date | null;

  @Expose()
  @Type(() => Date)
  authorizedAt!: Date;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;

  @Expose()
  @Type(() => UserGroupMembershipResponseDto)
  groupMemberships?: UserGroupMembershipResponseDto[];
}
