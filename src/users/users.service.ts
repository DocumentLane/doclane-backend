import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  listUsers(): Promise<User[]> {
    return this.prismaService.user.findMany({
      include: this.createUserInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUser(userId: string): Promise<User> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      include: this.createUserInclude(),
    });

    if (!user) {
      throw new NotFoundException('User was not found.');
    }

    return user;
  }

  async updateUser(userId: string, dto: UpdateUserDto): Promise<User> {
    if (dto.role === undefined && dto.groupIds === undefined) {
      throw new BadRequestException('No user updates were provided.');
    }

    return this.prismaService.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      });

      if (!user) {
        throw new NotFoundException('User was not found.');
      }

      if (dto.groupIds !== undefined) {
        const uniqueGroupIds = [...new Set(dto.groupIds)];
        const groups = await tx.oidcGroup.findMany({
          where: {
            id: { in: uniqueGroupIds },
          },
          select: { id: true },
        });

        if (groups.length !== uniqueGroupIds.length) {
          throw new NotFoundException('Group was not found.');
        }

        await tx.userGroupMembership.deleteMany({
          where: { userId },
        });

        if (uniqueGroupIds.length > 0) {
          await tx.userGroupMembership.createMany({
            data: uniqueGroupIds.map((groupId) => ({
              userId,
              groupId,
            })),
          });
        }
      }

      if (dto.role !== undefined) {
        if (user.role === UserRole.ADMIN && dto.role !== UserRole.ADMIN) {
          const otherAdminCount = await tx.user.count({
            where: {
              role: UserRole.ADMIN,
              id: { not: userId },
            },
          });

          if (otherAdminCount === 0) {
            throw new BadRequestException('At least one admin must remain.');
          }
        }

        await tx.user.update({
          where: { id: userId },
          data: { role: dto.role },
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: this.createUserInclude(),
      });
    });
  }

  private createUserInclude(): Prisma.UserInclude {
    return {
      groupMemberships: {
        include: {
          group: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    };
  }
}
