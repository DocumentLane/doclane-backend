import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoldersService,
        {
          provide: PrismaService,
          useValue: prismaService,
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
});

function createFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-1',
    ownerId: 'user-1',
    name: 'Folder',
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
