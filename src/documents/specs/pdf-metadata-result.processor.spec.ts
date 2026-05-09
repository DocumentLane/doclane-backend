import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DocumentJobStatus,
  DocumentJobType,
  DocumentLinearizationStatus,
  DocumentOcrStatus,
  DocumentPageDerivativeKind,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkerSettingsService } from '../../worker-settings/worker-settings.service';
import { PdfMetadataResultPayload } from '../interfaces/pdf-metadata-result-payload.interface';
import { PdfMetadataResultProcessor } from '../pdf-metadata-result.processor';

describe('PdfMetadataResultProcessor', () => {
  it('enqueues OCR with persisted worker settings', async () => {
    const pdfOcrQueue = {
      add: jest.fn().mockResolvedValue({ id: 'bull-job-1' }),
    };
    const prismaService = createPrismaService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfMetadataResultProcessor,
        {
          provide: getQueueToken('pdf-ocr'),
          useValue: pdfOcrQueue,
        },
        {
          provide: PrismaService,
          useValue: prismaService,
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
    const processor = module.get(PdfMetadataResultProcessor);

    await processor.process(
      createJob({
        jobId: 'metadata-job-1',
        documentId: 'document-1',
        status: 'completed',
        pageCount: 1,
        hasTextLayer: false,
        pages: [
          {
            pageNumber: 1,
            width: 100,
            height: 200,
            rotation: 0,
            hasTextLayer: false,
          },
        ],
        preview: {
          pageNumber: 1,
          storageBucket: 'documents',
          objectKey: 'documents/document-1/previews/page-0001.png',
          contentType: 'image/png',
          width: 640,
          height: 900,
          sizeBytes: 12345,
        },
      }),
    );

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
    expect(prismaService.documentPage.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        documentId_pageNumber: {
          documentId: 'document-1',
          pageNumber: 1,
        },
      },
      select: { id: true },
    });
    expect(prismaService.documentPageDerivative.upsert).toHaveBeenCalledWith({
      where: {
        pageId_kind: {
          pageId: 'page-1',
          kind: DocumentPageDerivativeKind.PREVIEW,
        },
      },
      create: {
        pageId: 'page-1',
        kind: DocumentPageDerivativeKind.PREVIEW,
        storageBucket: 'documents',
        objectKey: 'documents/document-1/previews/page-0001.png',
        contentType: 'image/png',
        width: 640,
        height: 900,
        sizeBytes: BigInt(12345),
      },
      update: {
        storageBucket: 'documents',
        objectKey: 'documents/document-1/previews/page-0001.png',
        contentType: 'image/png',
        width: 640,
        height: 900,
        sizeBytes: BigInt(12345),
      },
    });
    expect(pdfOcrQueue.add).toHaveBeenCalledWith(
      'recognize-pages',
      expect.objectContaining({
        ocrOptions: {
          language: 'kor',
          dpi: 300,
          psm: 6,
          pdfOutputEnabled: true,
        },
      }),
      expect.any(Object),
    );
    expect(prismaService.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { ocrStatus: DocumentOcrStatus.PROCESSING },
    });
  });

  it('updates metadata progress without failing the document', async () => {
    const pdfOcrQueue = {
      add: jest.fn(),
    };
    const prismaService = createPrismaService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfMetadataResultProcessor,
        {
          provide: getQueueToken('pdf-ocr'),
          useValue: pdfOcrQueue,
        },
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: WorkerSettingsService,
          useValue: {
            getOcrOptions: jest.fn(),
          },
        },
      ],
    }).compile();
    const processor = module.get(PdfMetadataResultProcessor);

    await processor.process(
      createJob({
        jobId: 'metadata-job-1',
        documentId: 'document-1',
        status: 'progress',
        currentPageNumber: 1,
        completedPages: 1,
        totalPages: 2,
        progressPercent: 70,
      }),
    );

    expect(prismaService.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { linearizationStatus: DocumentLinearizationStatus.PROCESSING },
    });
    expect(prismaService.documentJob.update).toHaveBeenCalledWith({
      where: { id: 'metadata-job-1' },
      data: {
        status: DocumentJobStatus.ACTIVE,
        progressPercent: 70,
        currentPageNumber: 1,
        completedPages: 1,
        totalPages: 2,
        startedAt: expect.any(Date) as Date,
      },
    });
    expect(pdfOcrQueue.add).not.toHaveBeenCalled();
  });

  it('persists a linearized PDF result and enqueues OCR from it', async () => {
    const pdfOcrQueue = {
      add: jest.fn().mockResolvedValue({ id: 'bull-job-1' }),
    };
    const prismaService = createPrismaService();
    prismaService.document.findUniqueOrThrow.mockResolvedValue({
      id: 'document-1',
      originalObjectKey: 'documents/user-1/document-1/original.pdf',
      linearizedObjectKey: 'documents/document-1/linearized.pdf',
      storageBucket: 'documents',
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfMetadataResultProcessor,
        {
          provide: getQueueToken('pdf-ocr'),
          useValue: pdfOcrQueue,
        },
        {
          provide: PrismaService,
          useValue: prismaService,
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
    const processor = module.get(PdfMetadataResultProcessor);

    await processor.process(
      createJob({
        jobId: 'metadata-job-1',
        documentId: 'document-1',
        status: 'completed',
        pageCount: 1,
        hasTextLayer: false,
        linearization: {
          status: 'READY',
          objectKey: 'documents/document-1/linearized.pdf',
          sizeBytes: 2048,
        },
        pages: [
          {
            pageNumber: 1,
            width: 100,
            height: 200,
            rotation: 0,
            hasTextLayer: false,
          },
        ],
      }),
    );

    const documentUpdateCalls = prismaService.document.update.mock
      .calls as Array<
      [
        {
          data: {
            linearizationStatus?: DocumentLinearizationStatus;
            linearizedObjectKey?: string;
            linearizedSizeBytes?: bigint;
            linearizedAt?: Date;
          };
        },
      ]
    >;
    const linearizedUpdate = documentUpdateCalls.find(
      ([call]) =>
        call.data.linearizationStatus === DocumentLinearizationStatus.READY,
    );

    expect(linearizedUpdate?.[0].data).toMatchObject({
      linearizationStatus: DocumentLinearizationStatus.READY,
      linearizedObjectKey: 'documents/document-1/linearized.pdf',
      linearizedSizeBytes: BigInt(2048),
      linearizedAt: expect.any(Date) as Date,
    });

    const jobCreateCalls = prismaService.documentJob.create.mock.calls as Array<
      [{ data: { payload: { objectKey: string } } }]
    >;

    expect(jobCreateCalls[0]?.[0].data.payload.objectKey).toBe(
      'documents/document-1/linearized.pdf',
    );
  });
});

type MetadataResultTransaction = {
  documentPage: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  document: {
    update: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  documentJob: {
    update: jest.Mock;
    create: jest.Mock;
  };
  documentPageDerivative: {
    upsert: jest.Mock;
  };
};

function createPrismaService() {
  const tx = {
    documentPage: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'page-1' }),
    },
    document: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'document-1',
        originalObjectKey: 'documents/user-1/document-1/original.pdf',
        linearizedObjectKey: null,
        storageBucket: 'documents',
      }),
    },
    documentJob: {
      update: jest.fn(),
      create: jest.fn().mockResolvedValue({
        id: 'ocr-job-1',
        maxAttempts: 3,
      }),
    },
    documentPageDerivative: {
      upsert: jest.fn(),
    },
  };

  return {
    ...tx,
    $transaction: jest.fn(
      (
        input:
          | ((transaction: MetadataResultTransaction) => Promise<unknown>)
          | Promise<unknown>[],
      ) => {
        if (typeof input === 'function') {
          return input(tx);
        }

        return Promise.all(input);
      },
    ),
  } as unknown as PrismaService & typeof tx;
}

function createJob(payload: PdfMetadataResultPayload): {
  data: PdfMetadataResultPayload;
} {
  return {
    data: payload,
  };
}
