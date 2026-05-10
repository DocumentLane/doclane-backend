import { AuditAction, AuditResourceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs.service';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let prismaService: {
    auditLog: {
      create: jest.Mock<Promise<void>, [{ data: Record<string, unknown> }]>;
      findMany: jest.Mock<Promise<unknown[]>, [Record<string, unknown>]>;
    };
  };

  beforeEach(() => {
    prismaService = {
      auditLog: {
        create: jest.fn<Promise<void>, [{ data: Record<string, unknown> }]>(),
        findMany: jest.fn<Promise<unknown[]>, [Record<string, unknown>]>(),
      },
    };
    service = new AuditLogsService(prismaService as unknown as PrismaService);
  });

  it('records an audit log entry', async () => {
    await service.record({
      actorId: '11111111-1111-4111-8111-111111111111',
      action: AuditAction.DOCUMENT_UPDATE,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: '22222222-2222-4222-8222-222222222222',
      summary: 'Document updated.',
      after: { title: 'Updated' },
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    const createCall = prismaService.auditLog.create.mock.calls[0]?.[0];

    expect(createCall.data).toMatchObject({
      actorId: '11111111-1111-4111-8111-111111111111',
      action: AuditAction.DOCUMENT_UPDATE,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: '22222222-2222-4222-8222-222222222222',
      summary: 'Document updated.',
      after: { title: 'Updated' },
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('does not throw when audit log recording fails', async () => {
    prismaService.auditLog.create.mockRejectedValue(new Error('database down'));

    await expect(
      service.record({
        action: AuditAction.AUTH_LOGIN,
        resourceType: AuditResourceType.AUTH,
      }),
    ).resolves.toBeUndefined();
  });

  it('lists audit logs with filters and cursor pagination', async () => {
    prismaService.auditLog.findMany.mockResolvedValue([]);

    await service.list({
      actorId: '11111111-1111-4111-8111-111111111111',
      action: AuditAction.DOCUMENT_READ,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: '22222222-2222-4222-8222-222222222222',
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-10T00:00:00.000Z',
      take: 25,
      cursor: '33333333-3333-4333-8333-333333333333',
    });

    expect(prismaService.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        actorId: '11111111-1111-4111-8111-111111111111',
        action: AuditAction.DOCUMENT_READ,
        resourceType: AuditResourceType.DOCUMENT,
        resourceId: '22222222-2222-4222-8222-222222222222',
        createdAt: {
          gte: new Date('2026-05-01T00:00:00.000Z'),
          lte: new Date('2026-05-10T00:00:00.000Z'),
        },
      },
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
      take: 25,
      cursor: { id: '33333333-3333-4333-8333-333333333333' },
      skip: 1,
    });
  });
});
