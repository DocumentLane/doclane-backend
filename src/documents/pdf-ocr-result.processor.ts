import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { DocumentJobStatus, DocumentOcrStatus, Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PdfOcrResultPayload } from './interfaces/pdf-ocr-result-payload.interface';

@Injectable()
@Processor('pdf-ocr-result')
export class PdfOcrResultProcessor extends WorkerHost {
  constructor(private readonly prismaService: PrismaService) {
    super();
  }

  async process(job: Job<PdfOcrResultPayload>): Promise<void> {
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
    result: Extract<PdfOcrResultPayload, { status: 'completed' }>,
  ): Promise<void> {
    await this.prismaService.$transaction(async (tx) => {
      const pages = await tx.documentPage.findMany({
        where: { documentId: result.documentId },
        select: {
          id: true,
          pageNumber: true,
        },
      });
      const pageIdByNumber = new Map(
        pages.map((page) => [page.pageNumber, page.id]),
      );

      await tx.documentPageOcr.deleteMany({
        where: {
          page: {
            documentId: result.documentId,
          },
        },
      });

      const ocrPages = result.pages.map((page) => {
        const pageId = pageIdByNumber.get(page.pageNumber);

        if (!pageId) {
          throw new Error('OCR result references an unknown page.');
        }

        return {
          pageId,
          text: page.text,
          language: page.language,
          confidence: page.confidence,
        };
      });

      if (ocrPages.length > 0) {
        await tx.documentPageOcr.createMany({
          data: ocrPages,
        });
      }

      const documentUpdateData: Prisma.DocumentUpdateInput = {
        ocrStatus: DocumentOcrStatus.COMPLETED,
        hasTextLayer: true,
      };

      if (result.ocrPdf) {
        documentUpdateData.ocrObjectKey = result.ocrPdf.objectKey;
        documentUpdateData.ocrLinearized = result.ocrPdf.linearized;
        documentUpdateData.ocrSizeBytes = result.ocrPdf.sizeBytes;
        documentUpdateData.ocrChecksumSha256 = result.ocrPdf.checksumSha256;
        documentUpdateData.ocrCompletedAt = new Date();
      }

      await tx.documentPage.updateMany({
        where: { documentId: result.documentId },
        data: { hasTextLayer: true },
      });

      await tx.document.update({
        where: { id: result.documentId },
        data: documentUpdateData,
      });

      await tx.documentJob.update({
        where: { id: result.jobId },
        data: {
          status: DocumentJobStatus.COMPLETED,
          progressPercent: 100,
          completedPages: result.pages.length,
          totalPages: result.pages.length,
          result: this.toJsonObject(result),
          completedAt: new Date(),
        },
      });
    });
  }

  private async applyProgressResult(
    result: Extract<PdfOcrResultPayload, { status: 'progress' }>,
  ): Promise<void> {
    await this.prismaService.documentJob.update({
      where: { id: result.jobId },
      data: {
        status: DocumentJobStatus.ACTIVE,
        progressPercent: result.progressPercent,
        currentPageNumber: result.currentPageNumber,
        completedPages: result.completedPages,
        totalPages: result.totalPages,
        startedAt: new Date(),
      },
    });
  }

  private async applyFailedResult(
    result: Extract<PdfOcrResultPayload, { status: 'failed' }>,
  ): Promise<void> {
    await this.prismaService.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: result.documentId },
        data: { ocrStatus: DocumentOcrStatus.FAILED },
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

  private toJsonObject(value: PdfOcrResultPayload): Prisma.InputJsonObject {
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

    const payload = {
      jobId: value.jobId,
      documentId: value.documentId,
      status: value.status,
      pages: value.pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
        language: page.language,
        confidence: page.confidence,
      })),
      ...(value.ocrPdf
        ? {
            ocrPdf: {
              objectKey: value.ocrPdf.objectKey,
              sizeBytes: value.ocrPdf.sizeBytes,
              checksumSha256: value.ocrPdf.checksumSha256,
              contentType: value.ocrPdf.contentType,
              linearized: value.ocrPdf.linearized,
            },
          }
        : {}),
    };

    return payload;
  }
}
