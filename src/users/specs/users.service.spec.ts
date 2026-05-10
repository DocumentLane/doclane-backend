import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: {
    $transaction: jest.Mock;
    user: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    oidcGroup: {
      findMany: jest.Mock;
    };
    userGroupMembership: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    const runTransaction = (callback: (tx: typeof prismaService) => unknown) =>
      Promise.resolve(callback(prismaService));

    prismaService = {
      $transaction: jest.fn(runTransaction),
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      oidcGroup: {
        findMany: jest.fn(),
      },
      userGroupMembership: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('lists users with group memberships', async () => {
    const users = [createUser()];
    prismaService.user.findMany.mockResolvedValue(users);

    await expect(service.listUsers()).resolves.toEqual(users);
    expect(prismaService.user.findMany).toHaveBeenCalledWith({
      include: {
        groupMemberships: {
          include: { group: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('updates role and replaces group memberships', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: UserRole.USER,
    });
    prismaService.oidcGroup.findMany.mockResolvedValue([
      { id: 'group-1' },
      { id: 'group-2' },
    ]);
    prismaService.user.findUniqueOrThrow.mockResolvedValue(
      createUser({ role: UserRole.ADMIN }),
    );

    await expect(
      service.updateUser('user-1', {
        role: UserRole.ADMIN,
        groupIds: ['group-1', 'group-2', 'group-1'],
      }),
    ).resolves.toMatchObject({ role: UserRole.ADMIN });
    expect(prismaService.userGroupMembership.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prismaService.userGroupMembership.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', groupId: 'group-1' },
        { userId: 'user-1', groupId: 'group-2' },
      ],
    });
    expect(prismaService.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: UserRole.ADMIN },
    });
  });

  it('rejects unknown group ids during membership replacement', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: UserRole.USER,
    });
    prismaService.oidcGroup.findMany.mockResolvedValue([{ id: 'group-1' }]);

    await expect(
      service.updateUser('user-1', {
        groupIds: ['group-1', 'group-2'],
      }),
    ).rejects.toThrow('Group was not found.');
    expect(prismaService.userGroupMembership.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects demoting the last admin', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
    });
    prismaService.user.count.mockResolvedValue(0);

    await expect(
      service.updateUser('admin-1', {
        role: UserRole.USER,
      }),
    ).rejects.toThrow('At least one admin must remain.');
    expect(prismaService.user.update).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when another admin remains', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
    });
    prismaService.user.count.mockResolvedValue(1);
    prismaService.user.findUniqueOrThrow.mockResolvedValue(
      createUser({ id: 'admin-1', role: UserRole.USER }),
    );

    await expect(
      service.updateUser('admin-1', {
        role: UserRole.USER,
      }),
    ).resolves.toMatchObject({ role: UserRole.USER });
    expect(prismaService.user.update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: { role: UserRole.USER },
    });
  });
});

function createUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'User',
    role: UserRole.USER,
    groupsInitializedAt: new Date(),
    authorizedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    groupMemberships: [],
    ...overrides,
  };
}
