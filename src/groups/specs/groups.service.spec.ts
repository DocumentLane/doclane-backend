import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GroupsService } from '../groups.service';

describe('GroupsService', () => {
  let service: GroupsService;
  let prismaService: {
    oidcGroup: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaService = {
      oidcGroup: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('https://issuer.example.com'),
          },
        },
      ],
    }).compile();

    service = module.get(GroupsService);
  });

  it('creates a group under the configured issuer', async () => {
    const group = createGroup({ displayName: 'Team A' });
    prismaService.oidcGroup.create.mockResolvedValue(group);

    await expect(
      service.createGroup({
        externalId: ' team-a ',
        displayName: ' Team A ',
      }),
    ).resolves.toEqual(group);
    expect(prismaService.oidcGroup.create).toHaveBeenCalledWith({
      data: {
        issuer: 'https://issuer.example.com',
        externalId: 'team-a',
        displayName: 'Team A',
        description: null,
      },
    });
  });

  it('updates group metadata', async () => {
    const group = createGroup({ displayName: 'Updated' });
    prismaService.oidcGroup.update.mockResolvedValue(group);

    await expect(
      service.updateGroup('group-1', {
        displayName: ' Updated ',
        description: '  ',
      }),
    ).resolves.toEqual(group);
    expect(prismaService.oidcGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: {
        displayName: 'Updated',
        description: null,
      },
    });
  });

  it('rejects duplicate groups', async () => {
    prismaService.oidcGroup.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.createGroup({ externalId: 'team-a' })).rejects.toThrow(
      'Group already exists.',
    );
  });
});

function createGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    issuer: 'https://issuer.example.com',
    externalId: 'team-a',
    displayName: 'Team A',
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
