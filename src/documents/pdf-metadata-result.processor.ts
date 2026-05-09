import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import {
  DocumentLinearizationStatus,
  DocumentJobStatus,
  DocumentJobType,
  DocumentOcrStatus,
  DocumentPageDerivativeKind,
  DocumentStatus,
  Prisma,
} from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerSettingsService } from '../worker-settings/worker-settings.service';
import { PdfMetadataResultPayload } from './interfaces/pdf-metadata-result-payload.interface';
import { PdfOcrJobPayload } from './interfaces/pdf-ocr-job-payload.interface';

@Injectable()
@Processor('pdf-metadata-result')
export class PdfMetadataResultProcessor extends WorkerHost {
  constructor(
    @InjectQueue('pdf-ocr')
    private readonly pdfOcrQueue: Queue<PdfOcrJobPayload>,
    private readonly prismaService: PrismaService,
    private readonly workerSettingsService: WorkerSettingsService,
  ) {
    super();
  }

  async process(job: Job<PdfMetadataResultPayload>): Promise<void> {
    if (job.data.status === 'completed') {
      await this.applyCompletedResult(job.data);
      return;
    }

    if (job.data.status === 'progress') {
      await this.applyProgressResult(job.data);
      return;
    }

    await this.applyFailedResult(job.data);
  }

  private async applyCompletedResult(
    result: Extract<PdfMetadataResultPayload, { status: 'completed' }>,
  ): Promise<void> {
    const ocrOptions = await this.workerSettingsService.getOcrOptions();
    const jobs = await this.prismaService.$transaction(async (tx) => {
      await tx.documentPage.deleteMany({
        where: { documentId: result.documentId },
      });

      await tx.documentPage.createMany({
        data: result.pages.map((page) => ({
          documentId: result.documentId,
          pageNumber: page.pageNumber,
          width: page.width,
          height: page.height,
          rotation: page.rotation,
          hasTextLayer: page.hasTextLayer,
        })),
      });

      await tx.document.update({
        where: { id: result.documentId },
        data: {
          status: DocumentStatus.READY,
          ocrStatus: result.hasTextLayer
            ? DocumentOcrStatus.NOT_REQUIRED
            : DocumentOcrStatus.PENDING,
          ...this.createLinearizationUpdateData(result.linearization),
          pageCount: result.pageCount,
          hasTextLayer: result.hasTextLayer,
          metadataExtractedAt: new Date(),
        },
      });

      await tx.documentJob.update({
        where: { id: result.jobId },
        data: {
          status: DocumentJobStatus.COMPLETED,
          result: this.toJsonObject(result),
          completedAt: new Date(),
        },
      });

      const document = await tx.document.findUniqueOrThrow({
        where: { id: result.documentId },
        select: {
          id: true,
          originalObjectKey: true,
          linearizedObjectKey: true,
          storageBucket: true,
        },
      });

      let ocrJob:
        | {
            id: string;
            maxAttempts: number;
            payload: PdfOcrJobPayload;
          }
        | undefined;

      if (result.preview) {
        const page = await tx.documentPage.findUniqueOrThrow({
          where: {
            documentId_pageNumber: {
              documentId: result.documentId,
              pageNumber: result.preview.pageNumber,
            },
          },
          select: { id: true },
        });

        await tx.documentPageDerivative.upsert({
          where: {
            pageId_kind: {
              pageId: page.id,
              kind: DocumentPageDerivativeKind.PREVIEW,
            },
          },
          create: {
            pageId: page.id,
            kind: DocumentPageDerivativeKind.PREVIEW,
            storageBucket: result.preview.storageBucket,
            objectKey: result.preview.objectKey,
            contentType: result.preview.contentType,
            width: result.preview.width,
            height: result.preview.height,
            sizeBytes: BigInt(result.preview.sizeBytes),
          },
          update: {
            storageBucket: result.preview.storageBucket,
            objectKey: result.preview.objectKey,
            contentType: result.preview.contentType,
            width: result.preview.width,
            height: result.preview.height,
            sizeBytes: BigInt(result.preview.sizeBytes),
          },
        });
      }

      if (!result.hasTextLayer) {
        const ocrPayload: PdfOcrJobPayload = {
          documentId: document.id,
          objectKey: document.linearizedObjectKey ?? document.originalObjectKey,
          storageBucket: document.storageBucket,
          ocrOptions,
          pages: result.pages.map((page) => ({
            pageNumber: page.pageNumber,
            width: page.width,
            height: page.height,
            rotation: page.rotation,
          })),
        };
        const createdOcrJob = await tx.documentJob.create({
          data: {
            documentId: result.documentId,
            type: DocumentJobType.PDF_OCR,
            status: DocumentJobStatus.QUEUED,
            queueName: 'pdf-ocr',
            payload: this.toOcrPayloadJson(ocrPayload),
          },
        });

        ocrJob = {
          id: createdOcrJob.id,
          maxAttempts: createdOcrJob.maxAttempts,
          payload: ocrPayload,
        };
      }

      return ocrJob;
    });

    if (jobs) {
      await this.enqueueOcrJob(jobs);
    }
  }

  private async applyFailedResult(
    result: Extract<PdfMetadataResultPayload, { status: 'failed' }>,
  ): Promise<void> {
    await this.prismaService.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: result.documentId },
        data: { status: DocumentStatus.PROCESSING_FAILED },
      });

      await tx.documentJob.update({
        where: { id: result.jobId },
        data: {
          status: DocumentJobStatus.FAILED,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          completedAt: new Date(),
        },
      });

      await tx.documentJobLog.create({
        data: {
          jobId: result.jobId,
          level: 'ERROR',
          message: result.errorMessage,
          metadata: this.toJsonObject(result),
        },
      });
    });
  }

  private async applyProgressResult(
    result: Extract<PdfMetadataResultPayload, { status: 'progress' }>,
  ): Promise<void> {
    await this.prismaService.$transaction([
      this.prismaService.document.update({
        where: { id: result.documentId },
        data: { linearizationStatus: DocumentLinearizationStatus.PROCESSING },
      }),
      this.prismaService.documentJob.update({
        where: { id: result.jobId },
        data: {
          status: DocumentJobStatus.ACTIVE,
          progressPercent: result.progressPercent,
          currentPageNumber: result.currentPageNumber,
          completedPages: result.completedPages,
          totalPages: result.totalPages,
          startedAt: new Date(),
        },
      }),
    ]);
  }

  private toJsonObject(
    value: PdfMetadataResultPayload,
  ): Prisma.InputJsonObject {
    if (value.status === 'progress') {
      return {
        jobId: value.jobId,
        documentId: value.documentId,
        status: value.status,
        currentPageNumber: value.currentPageNumber,
        completedPages: value.completedPages,
        totalPages: value.totalPages,
        progressPercent: value.progressPercent,
      };
    }

    if (value.status === 'failed') {
      return {
        jobId: value.jobId,
        documentId: value.documentId,
        status: value.status,
        errorCode: value.errorCode,
        errorMessage: value.errorMessage,
      };
    }

    return {
      jobId: value.jobId,
      documentId: value.documentId,
      status: value.status,
      pageCount: value.pageCount,
      hasTextLayer: value.hasTextLayer,
      linearization: value.linearization
        ? {
            status: value.linearization.status,
            objectKey: value.linearization.objectKey,
            sizeBytes: value.linearization.sizeBytes,
            errorMessage: value.linearization.errorMessage,
          }
        : undefined,
      pages: value.pages.map((page) => ({
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        rotation: page.rotation,
        hasTextLayer: page.hasTextLayer,
      })),
      preview: value.preview
        ? {
            pageNumber: value.preview.pageNumber,
            storageBucket: value.preview.storageBucket,
            objectKey: value.preview.objectKey,
            contentType: value.preview.contentType,
            width: value.preview.width,
            height: value.preview.height,
            sizeBytes: value.preview.sizeBytes,
          }
        : undefined,
    };
  }

  private async enqueueOcrJob(job: {
    id: string;
    maxAttempts: number;
    payload: PdfOcrJobPayload;
  }): Promise<void> {
    try {
      const bullJob = await this.pdfOcrQueue.add(
        'recognize-pages',
        job.payload,
        {
          jobId: job.id,
          attempts: job.maxAttempts,
          removeOnComplete: false,
          removeOnFail: false,
        },
      );

      await this.prismaService.$transaction([
        this.prismaService.document.update({
          where: { id: job.payload.documentId },
          data: { ocrStatus: DocumentOcrStatus.PROCESSING },
        }),
        this.prismaService.documentJob.update({
          where: { id: job.id },
          data: { bullJobId: bullJob.id },
        }),
      ]);
    } catch {
      await this.prismaService.$transaction([
        this.prismaService.document.update({
          where: { id: job.payload.documentId },
          data: { ocrStatus: DocumentOcrStatus.FAILED },
        }),
        this.prismaService.documentJob.update({
          where: { id: job.id },
          data: {
            status: DocumentJobStatus.FAILED,
            errorCode: 'QUEUE_ENQUEUE_FAILED',
            errorMessage: 'Failed to enqueue pdf OCR job.',
            completedAt: new Date(),
          },
        }),
        this.prismaService.documentJobLog.create({
          data: {
            jobId: job.id,
            level: 'ERROR',
            message: 'Failed to enqueue pdf OCR job.',
          },
        }),
      ]);
    }
  }

  private createLinearizationUpdateData(
    linearization: Extract<
      PdfMetadataResultPayload,
      { status: 'completed' }
    >['linearization'],
  ): Prisma.DocumentUpdateInput {
    if (!linearization) {
      return { linearizationStatus: DocumentLinearizationStatus.UNAVAILABLE };
    }

    if (linearization.status === 'READY' && linearization.objectKey) {
      return {
        linearizationStatus: DocumentLinearizationStatus.READY,
        linearizedObjectKey: linearization.objectKey,
        linearizedSizeBytes:
          linearization.sizeBytes === undefined
            ? undefined
            : BigInt(linearization.sizeBytes),
        linearizedAt: new Date(),
      };
    }

    return {
      linearizationStatus:
        linearization.status === 'FAILED'
          ? DocumentLinearizationStatus.FAILED
          : DocumentLinearizationStatus.UNAVAILABLE,
    };
  }

  private toOcrPayloadJson(payload: PdfOcrJobPayload): Prisma.InputJsonObject {
    return {
      documentId: payload.documentId,
      objectKey: payload.objectKey,
      storageBucket: payload.storageBucket,
      language: payload.language,
      ocrOptions: payload.ocrOptions
        ? {
            language: payload.ocrOptions.language,
            dpi: payload.ocrOptions.dpi,
            psm: payload.ocrOptions.psm,
            pdfOutputEnabled: payload.ocrOptions.pdfOutputEnabled,
          }
        : undefined,
      pages: payload.pages.map((page) => ({
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        rotation: page.rotation,
      })),
    };
  }
}
