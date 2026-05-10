import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OidcGroup, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  listGroups(): Promise<OidcGroup[]> {
    return this.prismaService.oidcGroup.findMany({
      orderBy: [{ externalId: 'asc' }],
    });
  }

  async createGroup(dto: CreateGroupDto): Promise<OidcGroup> {
    const externalId = this.normalizeRequired(dto.externalId, 'Group ID');
    const displayName = this.normalizeOptional(dto.displayName);
    const description = this.normalizeOptional(dto.description);

    try {
      return await this.prismaService.oidcGroup.create({
        data: {
          issuer: this.getDefaultIssuer(),
          externalId,
          displayName: displayName ?? externalId,
          description,
        },
      });
    } catch (error) {
      this.throwIfDuplicateGroup(error);
      throw error;
    }
  }

  async updateGroup(groupId: string, dto: UpdateGroupDto): Promise<OidcGroup> {
    const data: Prisma.OidcGroupUpdateInput = {};

    if (Object.prototype.hasOwnProperty.call(dto, 'displayName')) {
      data.displayName = this.normalizeOptional(dto.displayName);
    }

    if (Object.prototype.hasOwnProperty.call(dto, 'description')) {
      data.description = this.normalizeOptional(dto.description);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No group updates were provided.');
    }

    try {
      return await this.prismaService.oidcGroup.update({
        where: { id: groupId },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Group was not found.');
      }

      throw error;
    }
  }

  private getDefaultIssuer(): string {
    return this.configService.get<string>('auth.oidc.issuerUrl', 'manual');
  }

  private normalizeRequired(value: string, fieldName: string): string {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new BadRequestException(`${fieldName} must not be empty.`);
    }

    return normalizedValue;
  }

  private normalizeOptional(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  private throwIfDuplicateGroup(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new BadRequestException('Group already exists.');
    }
  }
}
