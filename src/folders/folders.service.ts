import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Folder, Prisma, ResourcePermission, UserRole } from '@prisma/client';
import { AccessControlService } from '../access-control/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

@Injectable()
export class FoldersService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly accessControlService: AccessControlService,
  ) {}

  async createFolder(userId: string, dto: CreateFolderDto): Promise<Folder> {
    const name = this.normalizeName(dto.name);

    try {
      return await this.prismaService.folder.create({
        data: {
          ownerId: userId,
          name,
        },
      });
    } catch (error) {
      this.throwIfDuplicateFolderName(error);
      throw error;
    }
  }

  async listFolders(
    userId: string,
    role: UserRole = UserRole.USER,
  ): Promise<Folder[]> {
    return this.prismaService.folder.findMany({
      where: await this.accessControlService.createReadableFolderWhere(
        userId,
        role,
      ),
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFolder(
    userId: string,
    folderId: string,
    role: UserRole = UserRole.USER,
  ): Promise<Folder> {
    const folder = await this.prismaService.folder.findFirst({
      where: await this.accessControlService.createReadableFolderWhere(
        userId,
        role,
        folderId,
      ),
    });

    if (!folder) {
      throw new NotFoundException('Folder was not found.');
    }

    return folder;
  }

  async updateFolder(
    userId: string,
    folderId: string,
    dto: UpdateFolderDto,
    role: UserRole = UserRole.USER,
  ): Promise<Folder> {
    await this.accessControlService.assertCanManageFolder(
      userId,
      role,
      folderId,
    );
    const name = this.normalizeName(dto.name);

    try {
      return await this.prismaService.folder.update({
        where: { id: folderId },
        data: { name },
      });
    } catch (error) {
      this.throwIfDuplicateFolderName(error);
      throw error;
    }
  }

  async deleteFolder(
    userId: string,
    folderId: string,
    role: UserRole = UserRole.USER,
  ): Promise<void> {
    await this.accessControlService.assertCanManageFolder(
      userId,
      role,
      folderId,
    );

    const documentCount = await this.prismaService.document.count({
      where: {
        ownerId: userId,
        folderId,
        deletedAt: null,
      },
    });

    if (documentCount > 0) {
      throw new BadRequestException('Folder must be empty before deletion.');
    }

    await this.prismaService.folder.delete({
      where: { id: folderId },
    });
  }

  async updatePublicAccess(
    userId: string,
    role: UserRole,
    folderId: string,
    isPublic: boolean,
  ): Promise<Folder> {
    await this.accessControlService.assertCanManageFolder(
      userId,
      role,
      folderId,
    );

    return this.prismaService.folder.update({
      where: { id: folderId },
      data: { isPublic },
    });
  }

  async listPermissions(userId: string, role: UserRole, folderId: string) {
    await this.accessControlService.assertCanManageFolder(
      userId,
      role,
      folderId,
    );

    return this.prismaService.folderPermission.findMany({
      where: { folderId },
      include: {
        user: true,
        group: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async saveGroupPermission(
    userId: string,
    role: UserRole,
    folderId: string,
    groupId: string,
    permission: ResourcePermission,
  ) {
    await this.accessControlService.assertCanManageFolder(
      userId,
      role,
      folderId,
    );
    await this.findGroupOrThrow(groupId);
    this.assertReadPermission(permission);

    return this.prismaService.folderPermission.upsert({
      where: {
        folderId_groupId: {
          folderId,
          groupId,
        },
      },
      create: {
        folderId,
        groupId,
        permission: ResourcePermission.READ,
      },
      update: {
        permission: ResourcePermission.READ,
      },
    });
  }

  async removeGroupPermission(
    userId: string,
    role: UserRole,
    folderId: string,
    groupId: string,
  ): Promise<void> {
    await this.accessControlService.assertCanManageFolder(
      userId,
      role,
      folderId,
    );

    await this.prismaService.folderPermission.deleteMany({
      where: {
        folderId,
        groupId,
      },
    });
  }

  async saveUserPermission(
    userId: string,
    role: UserRole,
    folderId: string,
    targetUserId: string,
    permission: ResourcePermission,
  ) {
    await this.accessControlService.assertCanManageFolder(
      userId,
      role,
      folderId,
    );
    await this.findUserOrThrow(targetUserId);
    this.assertReadPermission(permission);

    return this.prismaService.folderPermission.upsert({
      where: {
        folderId_userId: {
          folderId,
          userId: targetUserId,
        },
      },
      create: {
        folderId,
        userId: targetUserId,
        permission: ResourcePermission.READ,
      },
      update: {
        permission: ResourcePermission.READ,
      },
    });
  }

  async removeUserPermission(
    userId: string,
    role: UserRole,
    folderId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.accessControlService.assertCanManageFolder(
      userId,
      role,
      folderId,
    );

    await this.prismaService.folderPermission.deleteMany({
      where: {
        folderId,
        userId: targetUserId,
      },
    });
  }

  private async findOwnedFolderOrThrow(
    userId: string,
    folderId: string,
  ): Promise<Folder> {
    const folder = await this.prismaService.folder.findFirst({
      where: {
        id: folderId,
        ownerId: userId,
      },
    });

    if (!folder) {
      throw new NotFoundException('Folder was not found.');
    }

    return folder;
  }

  private normalizeName(name: string): string {
    const normalizedName = name.trim();

    if (!normalizedName) {
      throw new BadRequestException('Folder name must not be empty.');
    }

    return normalizedName;
  }

  private throwIfDuplicateFolderName(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new BadRequestException('Folder name already exists.');
    }
  }

  private async findGroupOrThrow(groupId: string): Promise<void> {
    const group = await this.prismaService.oidcGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('Group was not found.');
    }
  }

  private async findUserOrThrow(userId: string): Promise<void> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User was not found.');
    }
  }

  private assertReadPermission(permission: ResourcePermission): void {
    if (permission !== ResourcePermission.READ) {
      throw new BadRequestException('Only READ permission is supported.');
    }
  }
}
