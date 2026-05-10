import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Folder, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

@Injectable()
export class FoldersService {
  constructor(private readonly prismaService: PrismaService) {}

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

  listFolders(userId: string): Promise<Folder[]> {
    return this.prismaService.folder.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFolder(userId: string, folderId: string): Promise<Folder> {
    return this.findOwnedFolderOrThrow(userId, folderId);
  }

  async updateFolder(
    userId: string,
    folderId: string,
    dto: UpdateFolderDto,
  ): Promise<Folder> {
    await this.findOwnedFolderOrThrow(userId, folderId);
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

  async deleteFolder(userId: string, folderId: string): Promise<void> {
    await this.findOwnedFolderOrThrow(userId, folderId);

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
}
