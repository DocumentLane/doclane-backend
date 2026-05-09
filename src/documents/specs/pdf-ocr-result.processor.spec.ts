import { DocumentJobStatus, DocumentOcrStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { PdfOcrResultPayload } from '../interfaces/pdf-ocr-result-payload.interface';
import { PdfOcrResultProcessor } from '../pdf-ocr-result.processor';

describe('PdfOcrResultProcessor', () => {
  it('stores OCR text and marks the OCR job completed', async () => {
    const tx = {
      documentPage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'page-1',
            pageNumber: 1,
          },
        ]),
        updateMany: jest.fn(),
      },
      documentPageOcr: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      document: {
        update: jest.fn(),
      },
      documentJob: {
        update: jest.fn(),
      },
    };
    const prismaService = createPrismaService(tx);
    const processor = new PdfOcrResultProcessor(prismaService);

    await processor.process(
      createJob({
        jobId: 'job-1',
        documentId: 'document-1',
        status: 'completed',
        pages: [
          {
            pageNumber: 1,
            text: 'Recognized text',
            language: 'eng',
            confidence: 97.5,
          },
        ],
        ocrPdf: {
          objectKey: 'documents/document-1/ocr/job-1.pdf',
          sizeBytes: 12345,
          checksumSha256: 'checksum',
          contentType: 'application/pdf',
          linearized: true,
        },
      }),
    );

    expect(tx.documentPageOcr.deleteMany).toHaveBeenCalledWith({
      where: {
        page: {
          documentId: 'document-1',
        },
      },
    });
    expect(tx.documentPageOcr.createMany).toHaveBeenCalledWith({
      data: [
        {
          pageId: 'page-1',
          text: 'Recognized text',
          language: 'eng',
          confidence: 97.5,
        },
      ],
    });
    expect(tx.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: {
        ocrStatus: DocumentOcrStatus.COMPLETED,
        hasTextLayer: true,
        ocrObjectKey: 'documents/document-1/ocr/job-1.pdf',
        ocrLinearized: true,
        ocrSizeBytes: 12345,
        ocrChecksumSha256: 'checksum',
        ocrCompletedAt: expect.any(Date) as Date,
      },
    });
    expect(tx.documentPage.updateMany).toHaveBeenCalledWith({
      where: { documentId: 'document-1' },
      data: { hasTextLayer: true },
    });
    expect(tx.documentJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: DocumentJobStatus.COMPLETED,
        progressPercent: 100,
        completedPages: 1,
        totalPages: 1,
        result: {
          jobId: 'job-1',
          documentId: 'document-1',
          status: 'completed',
          pages: [
            {
              pageNumber: 1,
              text: 'Recognized text',
              language: 'eng',
              confidence: 97.5,
            },
          ],
          ocrPdf: {
            objectKey: 'documents/document-1/ocr/job-1.pdf',
            sizeBytes: 12345,
            checksumSha256: 'checksum',
            contentType: 'application/pdf',
            linearized: true,
          },
        },
        completedAt: expect.any(Date) as Date,
      },
    });
  });

  it('updates OCR page progress', async () => {
    const tx = {
      documentJob: {
        update: jest.fn(),
      },
    };
    const prismaService = {
      documentJob: tx.documentJob,
    } as unknown as PrismaService;
    const processor = new PdfOcrResultProcessor(prismaService);

    await processor.process(
      createJob({
        jobId: 'job-1',
        documentId: 'document-1',
        status: 'progress',
        currentPageNumber: 5,
        completedPages: 3,
        totalPages: 10,
        progressPercent: 41,
      }),
    );

    expect(tx.documentJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: DocumentJobStatus.ACTIVE,
        progressPercent: 41,
        currentPageNumber: 5,
        completedPages: 3,
        totalPages: 10,
        startedAt: expect.any(Date) as Date,
      },
    });
  });

  it('marks the document OCR status failed when OCR fails', async () => {
    const tx = {
      document: {
        update: jest.fn(),
      },
      documentJob: {
        update: jest.fn(),
      },
      documentJobLog: {
        create: jest.fn(),
      },
    };
    const prismaService = createPrismaService(tx);
    const processor = new PdfOcrResultProcessor(prismaService);

    await processor.process(
      createJob({
        jobId: 'job-1',
        documentId: 'document-1',
        status: 'failed',
        errorCode: 'PDF_OCR_FAILED',
        errorMessage: 'OCR failed.',
      }),
    );

    expect(tx.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: { ocrStatus: DocumentOcrStatus.FAILED },
    });
    expect(tx.documentJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: DocumentJobStatus.FAILED,
        errorCode: 'PDF_OCR_FAILED',
        errorMessage: 'OCR failed.',
        completedAt: expect.any(Date) as Date,
      },
    });
    expect(tx.documentJobLog.create).toHaveBeenCalledWith({
      data: {
        jobId: 'job-1',
        level: 'ERROR',
        message: 'OCR failed.',
        metadata: {
          jobId: 'job-1',
          documentId: 'document-1',
          status: 'failed',
          errorCode: 'PDF_OCR_FAILED',
          errorMessage: 'OCR failed.',
        },
      },
    });
  });
});

function createPrismaService(tx: object): PrismaService {
  return {
    $transaction: jest.fn((callback: (transaction: object) => Promise<void>) =>
      callback(tx),
    ),
  } as unknown as PrismaService;
}

function createJob(payload: PdfOcrResultPayload): Job<PdfOcrResultPayload> {
  return {
    data: payload,
  } as Job<PdfOcrResultPayload>;
}
