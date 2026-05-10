import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DocumentJobStatus,
  DocumentJobType,
  DocumentLinearizationStatus,
  DocumentOcrStatus,
  DocumentPageDerivativeKind,
  DocumentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { WorkerSettingsService } from '../../worker-settings/worker-settings.service';
import { DocumentsService } from '../documents.service';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let pdfMetadataQueue: {
    add: jest.Mock;
  };
  let pdfOcrQueue: {
    add: jest.Mock;
  };
  let prismaService: {
    $transaction: jest.Mock;
    document: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    folder: {
      findFirst: jest.Mock;
    };
    documentJob: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    documentBookmark: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    documentNote: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    documentPageDerivative: {
      upsert: jest.Mock;
    };
  };
  let s3Service: {
    createGetObjectSignedUrl: jest.Mock;
    createPutObjectSignedUrl: jest.Mock;
    getDefaultBucket: jest.Mock;
  };

  beforeEach(async () => {
    const runTransaction = (input: unknown): Promise<unknown> => {
      if (typeof input === 'function') {
        const callback = input as (
          transaction: typeof prismaService,
        ) => Promise<unknown>;

        return callback(prismaService);
      }

      return Promise.all(input as Promise<unknown>[]);
    };

    pdfMetadataQueue = {
      add: jest.fn().mockResolvedValue({ id: 'bull-metadata-job-1' }),
    };
    pdfOcrQueue = {
      add: jest.fn().mockResolvedValue({ id: 'bull-ocr-job-1' }),
    };
    prismaService = {
      $transaction: jest.fn(runTransaction),
      document: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      folder: {
        findFirst: jest.fn(),
      },
      documentJob: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 'ocr-job-1',
          maxAttempts: 3,
        }),
        update: jest.fn(),
      },
      documentBookmark: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      documentNote: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      documentPageDerivative: {
        upsert: jest.fn(),
      },
    };
    s3Service = {
      createGetObjectSignedUrl: jest.fn().mockResolvedValue('signed-url'),
      createPutObjectSignedUrl: jest.fn().mockResolvedValue('upload-url'),
      getDefaultBucket: jest.fn().mockReturnValue('documents'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: getQueueToken('pdf-metadata'),
          useValue: pdfMetadataQueue,
        },
        {
          provide: getQueueToken('pdf-ocr'),
          useValue: pdfOcrQueue,
        },
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: S3Service,
          useValue: s3Service,
        },
        {
          provide: WorkerSettingsService,
          useValue: {
            getOcrOptions: jest.fn().mockResolvedValue({
              language: 'kor',
              dpi: 300,
              psm: 6,
              pdfOutputEnabled: true,
            }),
          },
        },
      ],
    }).compile();

    service = module.get(DocumentsService);
  });

  it('creates an upload session in an owned folder', async () => {
    prismaService.folder.findFirst.mockResolvedValue(createFolder());

    await expect(
      service.createUploadSession('user-1', {
        originalFileName: 'document.pdf',
        folderId: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toMatchObject({
      uploadUrl: 'upload-url',
      method: 'PUT',
      storageBucket: 'documents',
      contentType: 'application/pdf',
    });
    expect(prismaService.folder.findFirst).toHaveBeenCalledWith({
      where: {
        id: '11111111-1111-4111-8111-111111111111',
        ownerId: 'user-1',
      },
    });
    expect(prismaService.document.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'user-1',
        folderId: '11111111-1111-4111-8111-111111111111',
        title: 'document.pdf',
      }) as object,
    });
  });

  it('rejects upload sessions for folders not owned by the user', async () => {
    prismaService.folder.findFirst.mockResolvedValue(null);

    await expect(
      service.createUploadSession('user-1', {
        originalFileName: 'document.pdf',
        folderId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow('Folder was not found.');
    expect(prismaService.document.create).not.toHaveBeenCalled();
    expect(s3Service.createPutObjectSignedUrl).not.toHaveBeenCalled();
  });

  it('lists all owned documents by default', async () => {
    const documents = [createDocument()];
    prismaService.document.findMany.mockResolvedValue(documents);

    await expect(service.listDocuments('user-1')).resolves.toEqual(documents);
    expect(prismaService.document.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: 'user-1',
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('lists documents in a folder', async () => {
    const documents = [
      createDocument({ folderId: '11111111-1111-4111-8111-111111111111' }),
    ];
    prismaService.folder.findFirst.mockResolvedValue(createFolder());
    prismaService.document.findMany.mockResolvedValue(documents);

    await expect(
      service.listDocuments('user-1', '11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual(documents);
    expect(prismaService.document.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: 'user-1',
        deletedAt: null,
        folderId: '11111111-1111-4111-8111-111111111111',
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('rejects listing documents for folders not owned by the user', async () => {
    prismaService.folder.findFirst.mockResolvedValue(null);

    await expect(
      service.listDocuments('user-1', '11111111-1111-4111-8111-111111111111'),
    ).rejects.toThrow('Folder was not found.');
    expect(prismaService.document.findMany).not.toHaveBeenCalled();
  });

  it('lists root documents when folderId is null', async () => {
    const documents = [createDocument({ folderId: null })];
    prismaService.document.findMany.mockResolvedValue(documents);

    await expect(service.listDocuments('user-1', 'null')).resolves.toEqual(
      documents,
    );
    expect(prismaService.document.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: 'user-1',
        deletedAt: null,
        folderId: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('uses the original PDF for viewing before OCR PDF is ready', async () => {
    prismaService.document.findFirst.mockResolvedValue(
      createDocument({
        ocrStatus: DocumentOcrStatus.PROCESSING,
        ocrObjectKey: 'documents/document-1/ocr/job-1.pdf',
      }),
    );

    await service.createViewUrl('user-1', 'document-1');

    expect(s3Service.createGetObjectSignedUrl).toHaveBeenCalledWith({
      key: 'documents/user-1/document-1/original.pdf',
      expiresInSeconds: 300,
      responseContentDisposition: 'inline',
      responseContentType: 'application/pdf',
    });
  });

  it('uses the OCR PDF for viewing after OCR PDF is completed', async () => {
    prismaService.document.findFirst.mockResolvedValue(
      createDocument({
        ocrStatus: DocumentOcrStatus.COMPLETED,
        ocrObjectKey: 'documents/document-1/ocr/job-1.pdf',
      }),
    );

    await service.createViewUrl('user-1', 'document-1');

    expect(s3Service.createGetObjectSignedUrl).toHaveBeenCalledWith({
      key: 'documents/document-1/ocr/job-1.pdf',
      expiresInSeconds: 300,
      responseContentDisposition: 'inline',
      responseContentType: 'application/pdf',
    });
  });

  it('uses the linearized PDF for viewing before OCR PDF is ready', async () => {
    prismaService.document.findFirst.mockResolvedValue(
      createDocument({
        linearizedObjectKey: 'documents/document-1/linearized.pdf',
        linearizationStatus: DocumentLinearizationStatus.READY,
      }),
    );

    await expect(
      service.createViewUrl('user-1', 'document-1'),
    ).resolves.toMatchObject({
      isLinearized: true,
      linearizationStatus: DocumentLinearizationStatus.READY,
    });
    expect(s3Service.createGetObjectSignedUrl).toHaveBeenCalledWith({
      key: 'documents/document-1/linearized.pdf',
      expiresInSeconds: 300,
      responseContentDisposition: 'inline',
      responseContentType: 'application/pdf',
    });
  });

  it('creates a signed preview URL from the first page preview derivative', async () => {
    prismaService.document.findFirst.mockResolvedValue({
      ...createDocument(),
      pages: [
        {
          id: 'page-1',
          derivatives: [
            {
              objectKey: 'documents/document-1/previews/page-0001.png',
              contentType: 'image/png',
              width: 640,
              height: 900,
            },
          ],
        },
      ],
    });

    await expect(
      service.createPreviewUrl('user-1', 'document-1'),
    ).resolves.toEqual({
      documentId: 'document-1',
      previewUrl: 'signed-url',
      contentType: 'image/png',
      width: 640,
      height: 900,
      expiresIn: 300,
    });
    expect(s3Service.createGetObjectSignedUrl).toHaveBeenCalledWith({
      key: 'documents/document-1/previews/page-0001.png',
      expiresInSeconds: 300,
      responseContentDisposition: 'inline',
      responseContentType: 'image/png',
    });
  });

  it('creates a thumbnail upload session and records the first page thumbnail', async () => {
    prismaService.document.findFirst.mockResolvedValue({
      ...createDocument(),
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
        },
      ],
    });

    await expect(
      service.createThumbnailUploadSession('user-1', 'document-1', {
        contentType: 'image/png',
        width: 320,
        height: 480,
        sizeBytes: 12345,
      }),
    ).resolves.toMatchObject({
      documentId: 'document-1',
      uploadUrl: 'upload-url',
      method: 'PUT',
      storageBucket: 'documents',
      contentType: 'image/png',
    });

    expect(prismaService.documentPageDerivative.upsert).toHaveBeenCalledWith({
      where: {
        pageId_kind: {
          pageId: 'page-1',
          kind: DocumentPageDerivativeKind.THUMBNAIL,
        },
      },
      create: {
        pageId: 'page-1',
        kind: DocumentPageDerivativeKind.THUMBNAIL,
        storageBucket: 'documents',
        objectKey: expect.stringMatching(
          /^documents\/user-1\/document-1\/thumbnails\/.+\.png$/,
        ) as string,
        contentType: 'image/png',
        width: 320,
        height: 480,
        sizeBytes: BigInt(12345),
      },
      update: {
        storageBucket: 'documents',
        objectKey: expect.stringMatching(
          /^documents\/user-1\/document-1\/thumbnails\/.+\.png$/,
        ) as string,
        contentType: 'image/png',
        width: 320,
        height: 480,
        sizeBytes: BigInt(12345),
      },
    });
    expect(s3Service.createPutObjectSignedUrl).toHaveBeenCalledWith({
      key: expect.stringMatching(
        /^documents\/user-1\/document-1\/thumbnails\/.+\.png$/,
      ) as string,
      contentType: 'image/png',
      expiresInSeconds: 900,
    });
  });

  it('rejects thumbnail updates before document pages are available', async () => {
    prismaService.document.findFirst.mockResolvedValue({
      ...createDocument(),
      pages: [],
    });

    await expect(
      service.createThumbnailUploadSession('user-1', 'document-1', {
        contentType: 'image/png',
      }),
    ).rejects.toThrow('Document pages are not available for thumbnail update.');
    expect(prismaService.documentPageDerivative.upsert).not.toHaveBeenCalled();
    expect(s3Service.createPutObjectSignedUrl).not.toHaveBeenCalled();
  });

  it('updates public access for an owned document', async () => {
    prismaService.document.findFirst.mockResolvedValue(createDocument());
    prismaService.document.update.mockResolvedValue(
      createDocument({ isPublic: true }),
    );

    await expect(
      service.updatePublicAccess('user-1', 'document-1', true),
    ).resolves.toMatchObject({ isPublic: true });
    expect(prismaService.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { isPublic: true },
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    });
  });

  it('updates the document title for an owned document', async () => {
    prismaService.document.findFirst.mockResolvedValue(createDocument());
    prismaService.document.update.mockResolvedValue(
      createDocument({ title: 'Updated title' }),
    );

    await expect(
      service.updateDocument('user-1', 'document-1', {
        title: '  Updated title  ',
      }),
    ).resolves.toMatchObject({ title: 'Updated title' });
    expect(prismaService.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { title: 'Updated title' },
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    });
  });

  it('updates the document title and moves it to an owned folder', async () => {
    prismaService.document.findFirst.mockResolvedValue(createDocument());
    prismaService.folder.findFirst.mockResolvedValue(createFolder());
    prismaService.document.update.mockResolvedValue(
      createDocument({
        title: 'Updated title',
        folderId: '11111111-1111-4111-8111-111111111111',
      }),
    );

    await expect(
      service.updateDocument('user-1', 'document-1', {
        title: '  Updated title  ',
        folderId: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toMatchObject({
      title: 'Updated title',
      folderId: '11111111-1111-4111-8111-111111111111',
    });
    expect(prismaService.folder.findFirst).toHaveBeenCalledWith({
      where: {
        id: '11111111-1111-4111-8111-111111111111',
        ownerId: 'user-1',
      },
    });
    expect(prismaService.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: {
        title: 'Updated title',
        folder: { connect: { id: '11111111-1111-4111-8111-111111111111' } },
      },
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    });
  });

  it('moves a document to the root folder', async () => {
    prismaService.document.findFirst.mockResolvedValue(
      createDocument({ folderId: '11111111-1111-4111-8111-111111111111' }),
    );
    prismaService.document.update.mockResolvedValue(
      createDocument({ folderId: null }),
    );

    await expect(
      service.updateDocument('user-1', 'document-1', {
        folderId: null,
      }),
    ).resolves.toMatchObject({ folderId: null });
    expect(prismaService.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { folder: { disconnect: true } },
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    });
  });

  it('rejects empty document title updates', async () => {
    prismaService.document.findFirst.mockResolvedValue(createDocument());

    await expect(
      service.updateDocument('user-1', 'document-1', { title: '   ' }),
    ).rejects.toThrow('Document title must not be empty.');
    expect(prismaService.document.update).not.toHaveBeenCalled();
  });

  it('rejects public access updates for documents not owned by the user', async () => {
    prismaService.document.findFirst.mockResolvedValue(null);

    await expect(
      service.updatePublicAccess('user-2', 'document-1', true),
    ).rejects.toThrow('Document was not found.');
    expect(prismaService.document.update).not.toHaveBeenCalled();
  });

  it('creates a signed public view URL for a public ready document', async () => {
    prismaService.document.findFirst.mockResolvedValue(
      createDocument({ isPublic: true }),
    );

    await expect(service.createPublicViewUrl('document-1')).resolves.toEqual({
      documentId: 'document-1',
      viewUrl: 'signed-url',
      expiresIn: 300,
      isLinearized: false,
      linearizationStatus: DocumentLinearizationStatus.PENDING,
    });
    expect(prismaService.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'document-1',
        isPublic: true,
        status: DocumentStatus.READY,
        uploadedAt: { not: null },
        deletedAt: null,
      },
    });
  });

  it('rejects public view URLs when the document is not public', async () => {
    prismaService.document.findFirst.mockResolvedValue(null);

    await expect(service.createPublicViewUrl('document-1')).rejects.toThrow(
      'Document was not found.',
    );
    expect(s3Service.createGetObjectSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects deleted or not ready documents through the public lookup', async () => {
    prismaService.document.findFirst.mockResolvedValue(null);

    await expect(service.getPublicDocument('document-1')).rejects.toThrow(
      'Document was not found.',
    );
    expect(prismaService.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'document-1',
        isPublic: true,
        status: DocumentStatus.READY,
        uploadedAt: { not: null },
        deletedAt: null,
      },
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    });
  });

  it('lists owned document bookmarks by page number', async () => {
    const bookmarks = [
      {
        id: 'bookmark-1',
        documentId: 'document-1',
        pageNumber: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    prismaService.document.findFirst.mockResolvedValue(createDocument());
    prismaService.documentBookmark.findMany.mockResolvedValue(bookmarks);

    await expect(
      service.listBookmarks('user-1', 'document-1'),
    ).resolves.toEqual(bookmarks);
    expect(prismaService.documentBookmark.findMany).toHaveBeenCalledWith({
      where: { documentId: 'document-1' },
      orderBy: { pageNumber: 'asc' },
    });
  });

  it('saves a bookmark for an owned document page', async () => {
    const bookmark = {
      id: 'bookmark-1',
      documentId: 'document-1',
      pageNumber: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaService.document.findFirst.mockResolvedValue(createDocument());
    prismaService.documentBookmark.upsert.mockResolvedValue(bookmark);

    await expect(
      service.saveBookmark('user-1', 'document-1', 1),
    ).resolves.toEqual(bookmark);
    expect(prismaService.documentBookmark.upsert).toHaveBeenCalledWith({
      where: {
        documentId_pageNumber: {
          documentId: 'document-1',
          pageNumber: 1,
        },
      },
      create: {
        documentId: 'document-1',
        pageNumber: 1,
      },
      update: {},
    });
  });

  it('removes a bookmark for an owned document page', async () => {
    prismaService.document.findFirst.mockResolvedValue(createDocument());

    await service.removeBookmark('user-1', 'document-1', 1);

    expect(prismaService.documentBookmark.deleteMany).toHaveBeenCalledWith({
      where: {
        documentId: 'document-1',
        pageNumber: 1,
      },
    });
  });

  it('lists owned document notes by page number', async () => {
    const notes = [
      {
        id: 'note-1',
        documentId: 'document-1',
        pageNumber: 2,
        content: 'Important clause',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    prismaService.document.findFirst.mockResolvedValue(createDocument());
    prismaService.documentNote.findMany.mockResolvedValue(notes);

    await expect(service.listNotes('user-1', 'document-1')).resolves.toEqual(
      notes,
    );
    expect(prismaService.documentNote.findMany).toHaveBeenCalledWith({
      where: { documentId: 'document-1' },
      orderBy: { pageNumber: 'asc' },
    });
  });

  it('saves a note for an owned document page', async () => {
    const note = {
      id: 'note-1',
      documentId: 'document-1',
      pageNumber: 1,
      content: 'Important clause',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaService.document.findFirst.mockResolvedValue(createDocument());
    prismaService.documentNote.upsert.mockResolvedValue(note);

    await expect(
      service.saveNote('user-1', 'document-1', 1, '  Important clause  '),
    ).resolves.toEqual(note);
    expect(prismaService.documentNote.upsert).toHaveBeenCalledWith({
      where: {
        documentId_pageNumber: {
          documentId: 'document-1',
          pageNumber: 1,
        },
      },
      create: {
        documentId: 'document-1',
        pageNumber: 1,
        content: 'Important clause',
      },
      update: {
        content: 'Important clause',
      },
    });
  });

  it('rejects an empty note', async () => {
    prismaService.document.findFirst.mockResolvedValue(createDocument());

    await expect(
      service.saveNote('user-1', 'document-1', 1, '   '),
    ).rejects.toThrow('Note content must not be empty.');
    expect(prismaService.documentNote.upsert).not.toHaveBeenCalled();
  });

  it('rejects a note page outside the document', async () => {
    prismaService.document.findFirst.mockResolvedValue(
      createDocument({ pageCount: 3 }),
    );

    await expect(
      service.saveNote('user-1', 'document-1', 4, 'Out of range'),
    ).rejects.toThrow('Note page number is outside the document.');
    expect(prismaService.documentNote.upsert).not.toHaveBeenCalled();
  });

  it('rejects notes for documents not owned by the user', async () => {
    prismaService.document.findFirst.mockResolvedValue(null);

    await expect(service.listNotes('user-2', 'document-1')).rejects.toThrow(
      'Document was not found.',
    );
    expect(prismaService.documentNote.findMany).not.toHaveBeenCalled();
  });

  it('removes a note for an owned document page', async () => {
    prismaService.document.findFirst.mockResolvedValue(createDocument());

    await service.removeNote('user-1', 'document-1', 1);

    expect(prismaService.documentNote.deleteMany).toHaveBeenCalledWith({
      where: {
        documentId: 'document-1',
        pageNumber: 1,
      },
    });
  });

  it('updates the last read page for an owned document', async () => {
    prismaService.document.findFirst.mockResolvedValue(
      createDocument({ pageCount: 10 }),
    );

    await service.updateReadingPosition('user-1', 'document-1', 7);

    expect(prismaService.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { lastReadPageNumber: 7 },
    });
  });

  it('rejects a last read page outside the document', async () => {
    prismaService.document.findFirst.mockResolvedValue(
      createDocument({ pageCount: 3 }),
    );

    await expect(
      service.updateReadingPosition('user-1', 'document-1', 4),
    ).rejects.toThrow('Last read page number is outside the document.');
    expect(prismaService.document.update).not.toHaveBeenCalled();
  });

  it('soft deletes an owned document', async () => {
    prismaService.document.findFirst.mockResolvedValue(createDocument());
    prismaService.document.update.mockResolvedValue(
      createDocument({
        status: DocumentStatus.DELETED,
        deletedAt: new Date(),
      }),
    );

    await service.deleteDocument('user-1', 'document-1');

    expect(prismaService.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: {
        status: DocumentStatus.DELETED,
        deletedAt: expect.any(Date) as Date,
      },
    });
  });

  it('enqueues OCR reprocessing for a ready owned document', async () => {
    prismaService.document.findFirst
      .mockResolvedValueOnce({
        ...createDocument({
          ocrStatus: DocumentOcrStatus.COMPLETED,
          ocrObjectKey: 'documents/document-1/ocr/old-job.pdf',
        }),
        pages: [
          {
            pageNumber: 1,
            width: 100,
            height: 200,
            rotation: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        ...createDocument({ ocrStatus: DocumentOcrStatus.PROCESSING }),
        jobs: [],
      });

    await expect(
      service.reprocessOcr('user-1', 'document-1'),
    ).resolves.toMatchObject({
      documentId: 'document-1',
      ocrStatus: DocumentOcrStatus.PROCESSING,
    });

    expect(prismaService.documentJob.create).toHaveBeenCalledWith({
      data: {
        documentId: 'document-1',
        type: DocumentJobType.PDF_OCR,
        status: DocumentJobStatus.QUEUED,
        queueName: 'pdf-ocr',
        payload: {
          documentId: 'document-1',
          objectKey: 'documents/user-1/document-1/original.pdf',
          storageBucket: 'documents',
          language: undefined,
          ocrOptions: {
            language: 'kor',
            dpi: 300,
            psm: 6,
            pdfOutputEnabled: true,
          },
          pages: [
            {
              pageNumber: 1,
              width: 100,
              height: 200,
              rotation: 0,
            },
          ],
        },
      },
    });
    expect(pdfOcrQueue.add).toHaveBeenCalledWith(
      'recognize-pages',
      expect.objectContaining({
        documentId: 'document-1',
        ocrOptions: {
          language: 'kor',
          dpi: 300,
          psm: 6,
          pdfOutputEnabled: true,
        },
      }),
      {
        jobId: 'ocr-job-1',
        attempts: 3,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    expect(prismaService.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { ocrStatus: DocumentOcrStatus.PROCESSING },
    });
    expect(prismaService.documentJob.update).toHaveBeenCalledWith({
      where: { id: 'ocr-job-1' },
      data: { bullJobId: 'bull-ocr-job-1' },
    });
  });

  it('rejects OCR reprocessing while OCR is already processing', async () => {
    prismaService.document.findFirst.mockResolvedValue({
      ...createDocument({ ocrStatus: DocumentOcrStatus.PROCESSING }),
      pages: [
        {
          pageNumber: 1,
          width: 100,
          height: 200,
          rotation: 0,
        },
      ],
    });

    await expect(service.reprocessOcr('user-1', 'document-1')).rejects.toThrow(
      'Document OCR is already processing.',
    );
    expect(pdfOcrQueue.add).not.toHaveBeenCalled();
  });

  it('marks the OCR reprocessing job failed when enqueue fails', async () => {
    pdfOcrQueue.add.mockRejectedValue(new Error('queue unavailable'));
    prismaService.document.findFirst.mockResolvedValue({
      ...createDocument(),
      pages: [
        {
          pageNumber: 1,
          width: 100,
          height: 200,
          rotation: 0,
        },
      ],
    });

    await expect(service.reprocessOcr('user-1', 'document-1')).rejects.toThrow(
      'Failed to enqueue pdf OCR job.',
    );
    expect(prismaService.documentJob.update).toHaveBeenCalledWith({
      where: { id: 'ocr-job-1' },
      data: {
        status: DocumentJobStatus.FAILED,
        errorCode: 'QUEUE_ENQUEUE_FAILED',
        errorMessage: 'Failed to enqueue pdf OCR job.',
        completedAt: expect.any(Date) as Date,
      },
    });
  });

  it('restarts a failed metadata job for an owned document', async () => {
    prismaService.document.findFirst
      .mockResolvedValueOnce(
        createDocument({ status: DocumentStatus.PROCESSING_FAILED }),
      )
      .mockResolvedValueOnce({
        ...createDocument({ status: DocumentStatus.METADATA_PROCESSING }),
        jobs: [],
      });
    prismaService.documentJob.findFirst
      .mockResolvedValueOnce({
        id: 'metadata-job-1',
        documentId: 'document-1',
        type: DocumentJobType.PDF_METADATA,
        status: DocumentJobStatus.FAILED,
      })
      .mockResolvedValueOnce(null);
    prismaService.documentJob.create.mockResolvedValueOnce({
      id: 'metadata-restart-job-1',
      maxAttempts: 3,
    });

    await expect(
      service.restartJob('user-1', 'document-1', 'metadata-job-1'),
    ).resolves.toMatchObject({
      documentId: 'document-1',
      status: DocumentStatus.METADATA_PROCESSING,
    });

    expect(prismaService.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: {
        status: DocumentStatus.METADATA_PROCESSING,
        linearizationStatus: DocumentLinearizationStatus.PROCESSING,
      },
    });
    expect(prismaService.documentJob.create).toHaveBeenCalledWith({
      data: {
        documentId: 'document-1',
        type: DocumentJobType.PDF_METADATA,
        status: DocumentJobStatus.QUEUED,
        queueName: 'pdf-metadata',
        payload: {
          documentId: 'document-1',
          objectKey: 'documents/user-1/document-1/original.pdf',
          storageBucket: 'documents',
        },
      },
    });
    expect(pdfMetadataQueue.add).toHaveBeenCalledWith(
      'extract-metadata',
      {
        documentId: 'document-1',
        objectKey: 'documents/user-1/document-1/original.pdf',
        storageBucket: 'documents',
      },
      {
        jobId: 'metadata-restart-job-1',
        attempts: 3,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    expect(prismaService.documentJob.update).toHaveBeenCalledWith({
      where: { id: 'metadata-restart-job-1' },
      data: { bullJobId: 'bull-metadata-job-1' },
    });
  });

  it('restarts a cancelled OCR job for a ready owned document', async () => {
    prismaService.document.findFirst
      .mockResolvedValueOnce({
        ...createDocument({ ocrStatus: DocumentOcrStatus.FAILED }),
        pages: [
          {
            pageNumber: 1,
            width: 100,
            height: 200,
            rotation: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        ...createDocument({ ocrStatus: DocumentOcrStatus.PROCESSING }),
        jobs: [],
      });
    prismaService.documentJob.findFirst
      .mockResolvedValueOnce({
        id: 'ocr-job-1',
        documentId: 'document-1',
        type: DocumentJobType.PDF_OCR,
        status: DocumentJobStatus.CANCELLED,
      })
      .mockResolvedValueOnce(null);
    prismaService.documentJob.create.mockResolvedValueOnce({
      id: 'ocr-restart-job-1',
      maxAttempts: 3,
    });

    await expect(
      service.restartJob('user-1', 'document-1', 'ocr-job-1'),
    ).resolves.toMatchObject({
      documentId: 'document-1',
      ocrStatus: DocumentOcrStatus.PROCESSING,
    });

    expect(pdfOcrQueue.add).toHaveBeenCalledWith(
      'recognize-pages',
      expect.objectContaining({
        documentId: 'document-1',
        ocrOptions: {
          language: 'kor',
          dpi: 300,
          psm: 6,
          pdfOutputEnabled: true,
        },
      }),
      {
        jobId: 'ocr-restart-job-1',
        attempts: 3,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    expect(prismaService.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { ocrStatus: DocumentOcrStatus.PROCESSING },
    });
  });

  it('rejects restarting a job that is not failed or cancelled', async () => {
    prismaService.document.findFirst.mockResolvedValue(createDocument());
    prismaService.documentJob.findFirst.mockResolvedValue({
      id: 'metadata-job-1',
      documentId: 'document-1',
      type: DocumentJobType.PDF_METADATA,
      status: DocumentJobStatus.ACTIVE,
    });

    await expect(
      service.restartJob('user-1', 'document-1', 'metadata-job-1'),
    ).rejects.toThrow(
      'Only failed or cancelled document jobs can be restarted.',
    );
    expect(prismaService.documentJob.create).not.toHaveBeenCalled();
    expect(pdfMetadataQueue.add).not.toHaveBeenCalled();
  });

  it('rejects restarting a job when another job of the same type is running', async () => {
    prismaService.document.findFirst.mockResolvedValue(createDocument());
    prismaService.documentJob.findFirst
      .mockResolvedValueOnce({
        id: 'metadata-job-1',
        documentId: 'document-1',
        type: DocumentJobType.PDF_METADATA,
        status: DocumentJobStatus.FAILED,
      })
      .mockResolvedValueOnce({
        id: 'metadata-job-2',
        documentId: 'document-1',
        type: DocumentJobType.PDF_METADATA,
        status: DocumentJobStatus.QUEUED,
      });

    await expect(
      service.restartJob('user-1', 'document-1', 'metadata-job-1'),
    ).rejects.toThrow('A document job of this type is already running.');
    expect(prismaService.documentJob.create).not.toHaveBeenCalled();
    expect(pdfMetadataQueue.add).not.toHaveBeenCalled();
  });
});

function createDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'document-1',
    ownerId: 'user-1',
    folderId: null,
    title: 'Document',
    originalFileName: 'document.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1000,
    checksumSha256: 'original-checksum',
    storageBucket: 'documents',
    originalObjectKey: 'documents/user-1/document-1/original.pdf',
    linearizedObjectKey: null,
    linearizedSizeBytes: null,
    linearizedAt: null,
    linearizationStatus: DocumentLinearizationStatus.PENDING,
    ocrObjectKey: null,
    ocrLinearized: false,
    ocrSizeBytes: null,
    ocrChecksumSha256: null,
    ocrCompletedAt: null,
    status: DocumentStatus.READY,
    ocrStatus: DocumentOcrStatus.PENDING,
    isPublic: false,
    pageCount: 1,
    lastReadPageNumber: null,
    hasTextLayer: false,
    uploadExpiresAt: null,
    uploadedAt: new Date(),
    metadataExtractedAt: new Date(),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ownerId: 'user-1',
    name: 'Folder',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
