import { Injectable, Logger } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { AuditLogRecord } from './interfaces/audit-log-record.interface';
import { AuditRequestMetadata } from './interfaces/audit-request-metadata.interface';

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);
  private readonly defaultTake = 50;

  constructor(private readonly prismaService: PrismaService) {}

  createRequestMetadata(request: Request): AuditRequestMetadata {
    const userAgent = request.headers['user-agent'];

    return {
      ipAddress: request.ip,
      userAgent: Array.isArray(userAgent) ? userAgent.join(', ') : userAgent,
    };
  }

  async record(record: AuditLogRecord): Promise<void> {
    try {
      await this.prismaService.auditLog.create({
        data: {
          actorId: record.actorId ?? null,
          action: record.action,
          resourceType: record.resourceType,
          resourceId: record.resourceId ?? null,
          summary: record.summary,
          before: record.before ?? Prisma.JsonNull,
          after: record.after ?? Prisma.JsonNull,
          ipAddress: record.ipAddress,
          userAgent: record.userAgent,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record audit log for ${record.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  list(query: ListAuditLogsQueryDto): Promise<AuditLog[]> {
    const take = query.take ?? this.defaultTake;
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...this.createCreatedAtWhere(query),
    };

    return this.prismaService.auditLog.findMany({
      where,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
    });
  }

  private createCreatedAtWhere(
    query: ListAuditLogsQueryDto,
  ): Pick<Prisma.AuditLogWhereInput, 'createdAt'> {
    if (!query.from && !query.to) {
      return {};
    }

    return {
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    };
  }
}
