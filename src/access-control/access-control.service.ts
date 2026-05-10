import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccessControlService {
  constructor(private readonly prismaService: PrismaService) {}

  async createReadableDocumentWhere(
    userId: string,
    role: UserRole,
    documentId?: string,
  ): Promise<Prisma.DocumentWhereInput> {
    const baseWhere: Prisma.DocumentWhereInput = {
      deletedAt: null,
    };

    if (documentId !== undefined) {
      baseWhere.id = documentId;
    }

    if (role === UserRole.ADMIN && documentId !== undefined) {
      return baseWhere;
    }

    const groupIds = await this.getUserGroupIds(userId);
    const accessWhere: Prisma.DocumentWhereInput[] = [
      { ownerId: userId },
      {
        permissions: {
          some: {
            userId,
          },
        },
      },
    ];

    if (groupIds.length > 0) {
      accessWhere.push(
        {
          permissions: {
            some: {
              groupId: { in: groupIds },
            },
          },
        },
        {
          folder: {
            permissions: {
              some: {
                groupId: { in: groupIds },
              },
            },
          },
        },
      );
    }

    accessWhere.push({
      folder: {
        permissions: {
          some: {
            userId,
          },
        },
      },
    });

    return {
      ...baseWhere,
      OR: accessWhere,
    };
  }

  async createReadableFolderWhere(
    userId: string,
    role: UserRole,
    folderId?: string,
  ): Promise<Prisma.FolderWhereInput> {
    const baseWhere: Prisma.FolderWhereInput = {};

    if (folderId !== undefined) {
      baseWhere.id = folderId;
    }

    if (role === UserRole.ADMIN && folderId !== undefined) {
      return baseWhere;
    }

    const groupIds = await this.getUserGroupIds(userId);
    const accessWhere: Prisma.FolderWhereInput[] = [
      { ownerId: userId },
      {
        permissions: {
          some: {
            userId,
          },
        },
      },
    ];

    if (groupIds.length > 0) {
      accessWhere.push({
        permissions: {
          some: {
            groupId: { in: groupIds },
          },
        },
      });
    }

    return {
      ...baseWhere,
      OR: accessWhere,
    };
  }

  async assertCanManageDocument(
    userId: string,
    role: UserRole,
    documentId: string,
  ): Promise<void> {
    if (role === UserRole.ADMIN) {
      const document = await this.prismaService.document.findFirst({
        where: {
          id: documentId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!document) {
        throw new NotFoundException('Document was not found.');
      }

      return;
    }

    const document = await this.prismaService.document.findFirst({
      where: {
        id: documentId,
        ownerId: userId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!document) {
      throw new ForbiddenException(
        'Only owners and admins can manage this document.',
      );
    }
  }

  async assertCanManageFolder(
    userId: string,
    role: UserRole,
    folderId: string,
  ): Promise<void> {
    if (role === UserRole.ADMIN) {
      const folder = await this.prismaService.folder.findFirst({
        where: { id: folderId },
        select: { id: true },
      });

      if (!folder) {
        throw new NotFoundException('Folder was not found.');
      }

      return;
    }

    const folder = await this.prismaService.folder.findFirst({
      where: {
        id: folderId,
        ownerId: userId,
      },
      select: { id: true },
    });

    if (!folder) {
      throw new ForbiddenException(
        'Only owners and admins can manage this folder.',
      );
    }
  }

  async getUserGroupIds(userId: string): Promise<string[]> {
    const memberships = await this.prismaService.userGroupMembership.findMany({
      where: { userId },
      select: { groupId: true },
    });

    return memberships.map((membership) => membership.groupId);
  }
}
