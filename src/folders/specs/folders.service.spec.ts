import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, ResourcePermission, UserRole } from '@prisma/client';
import { AccessControlService } from '../../access-control/access-control.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FoldersService } from '../folders.service';

describe('FoldersService', () => {
  let service: FoldersService;
  let prismaService: {
    folder: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    document: {
      count: jest.Mock;
    };
    folderPermission: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    oidcGroup: {
      findUnique: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };
  let accessControlService: {
    createReadableFolderWhere: jest.Mock;
    assertCanManageFolder: jest.Mock;
  };

  beforeEach(async () => {
    prismaService = {
      folder: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      document: {
        count: jest.fn(),
      },
      folderPermission: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      oidcGroup: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };
    accessControlService = {
      createReadableFolderWhere: jest
        .fn()
        .mockImplementation(
          (userId: string, _role: unknown, folderId?: string) => ({
            ...(folderId === undefined ? {} : { id: folderId }),
            ownerId: userId,
          }),
        ),
      assertCanManageFolder: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoldersService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: AccessControlService,
          useValue: accessControlService,
        },
      ],
    }).compile();

    service = module.get(FoldersService);
  });

  it('creates a folder with a trimmed name', async () => {
    const folder = createFolder({ name: 'Cases' });
    prismaService.folder.create.mockResolvedValue(folder);

    await expect(
      service.createFolder('user-1', { name: '  Cases  ' }),
    ).resolves.toEqual(folder);
    expect(prismaService.folder.create).toHaveBeenCalledWith({
      data: {
        ownerId: 'user-1',
        name: 'Cases',
      },
    });
  });

  it('rejects empty folder names', async () => {
    await expect(
      service.createFolder('user-1', { name: '   ' }),
    ).rejects.toThrow('Folder name must not be empty.');
    expect(prismaService.folder.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate folder names', async () => {
    prismaService.folder.create.mockRejectedValue(
      createUniqueConstraintError(),
    );

    await expect(
      service.createFolder('user-1', { name: 'Cases' }),
    ).rejects.toThrow('Folder name already exists.');
  });

  it('lists owned folders by creation date', async () => {
    const folders = [createFolder()];
    prismaService.folder.findMany.mockResolvedValue(folders);

    await expect(service.listFolders('user-1')).resolves.toEqual(folders);
    expect(prismaService.folder.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('gets an owned folder', async () => {
    const folder = createFolder();
    prismaService.folder.findFirst.mockResolvedValue(folder);

    await expect(service.getFolder('user-1', 'folder-1')).resolves.toEqual(
      folder,
    );
    expect(prismaService.folder.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'folder-1',
        ownerId: 'user-1',
      },
    });
  });

  it('rejects folders not owned by the user', async () => {
    prismaService.folder.findFirst.mockResolvedValue(null);

    await expect(service.getFolder('user-2', 'folder-1')).rejects.toThrow(
      'Folder was not found.',
    );
  });

  it('updates an owned folder name', async () => {
    prismaService.folder.findFirst.mockResolvedValue(createFolder());
    prismaService.folder.update.mockResolvedValue(
      createFolder({ name: 'Updated' }),
    );

    await expect(
      service.updateFolder('user-1', 'folder-1', { name: '  Updated  ' }),
    ).resolves.toMatchObject({ name: 'Updated' });
    expect(prismaService.folder.update).toHaveBeenCalledWith({
      where: { id: 'folder-1' },
      data: { name: 'Updated' },
    });
  });

  it('rejects deleting a folder that contains active documents', async () => {
    prismaService.folder.findFirst.mockResolvedValue(createFolder());
    prismaService.document.count.mockResolvedValue(1);

    await expect(service.deleteFolder('user-1', 'folder-1')).rejects.toThrow(
      'Folder must be empty before deletion.',
    );
    expect(prismaService.document.count).toHaveBeenCalledWith({
      where: {
        ownerId: 'user-1',
        folderId: 'folder-1',
        deletedAt: null,
      },
    });
    expect(prismaService.folder.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty owned folder', async () => {
    prismaService.folder.findFirst.mockResolvedValue(createFolder());
    prismaService.document.count.mockResolvedValue(0);

    await service.deleteFolder('user-1', 'folder-1');

    expect(prismaService.folder.delete).toHaveBeenCalledWith({
      where: { id: 'folder-1' },
    });
  });

  it('updates folder public access for managers', async () => {
    prismaService.folder.update.mockResolvedValue(
      createFolder({ isPublic: true }),
    );

    await expect(
      service.updatePublicAccess('user-1', UserRole.USER, 'folder-1', true),
    ).resolves.toMatchObject({ isPublic: true });
    expect(accessControlService.assertCanManageFolder).toHaveBeenCalledWith(
      'user-1',
      UserRole.USER,
      'folder-1',
    );
    expect(prismaService.folder.update).toHaveBeenCalledWith({
      where: { id: 'folder-1' },
      data: { isPublic: true },
    });
  });

  it('lists folder permissions for managers', async () => {
    const permissions = [createFolderPermission()];
    prismaService.folderPermission.findMany.mockResolvedValue(permissions);

    await expect(
      service.listPermissions('user-1', UserRole.USER, 'folder-1'),
    ).resolves.toEqual(permissions);
    expect(prismaService.folderPermission.findMany).toHaveBeenCalledWith({
      where: { folderId: 'folder-1' },
      include: {
        user: true,
        group: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('adds a group read permission for a manageable folder', async () => {
    const permission = createFolderPermission({
      groupId: '11111111-1111-4111-8111-111111111111',
    });
    prismaService.oidcGroup.findUnique.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
    prismaService.folderPermission.upsert.mockResolvedValue(permission);

    await expect(
      service.saveGroupPermission(
        'user-1',
        UserRole.USER,
        'folder-1',
        '11111111-1111-4111-8111-111111111111',
        ResourcePermission.READ,
      ),
    ).resolves.toEqual(permission);
    expect(prismaService.folderPermission.upsert).toHaveBeenCalledWith({
      where: {
        folderId_groupId: {
          folderId: 'folder-1',
          groupId: '11111111-1111-4111-8111-111111111111',
        },
      },
      create: {
        folderId: 'folder-1',
        groupId: '11111111-1111-4111-8111-111111111111',
        permission: ResourcePermission.READ,
      },
      update: {
        permission: ResourcePermission.READ,
      },
    });
  });
});

function createFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-1',
    ownerId: 'user-1',
    name: 'Folder',
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createFolderPermission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'permission-1',
    folderId: 'folder-1',
    userId: null,
    groupId: '11111111-1111-4111-8111-111111111111',
    permission: ResourcePermission.READ,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createUniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}
