import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  Document,
  DocumentBookmark,
  DocumentNote,
  DocumentJobStatus,
  DocumentJobType,
  DocumentLinearizationStatus,
  DocumentOcrStatus,
  DocumentPageDerivativeKind,
  DocumentStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { WorkerSettingsService } from '../worker-settings/worker-settings.service';
import { CompleteDocumentUploadDto } from './dto/complete-document-upload.dto';
import { CreateDocumentUploadSessionDto } from './dto/create-document-upload-session.dto';
import { DocumentDetail } from './interfaces/document-detail.interface';
import { DocumentPreviewResponse } from './interfaces/document-preview-response.interface';
import { DocumentStatusResponse } from './interfaces/document-status-response.interface';
import { DocumentUploadSessionResponse } from './interfaces/document-upload-session-response.interface';
import { DocumentViewResponse } from './interfaces/document-view-response.interface';
import { PdfMetadataJobPayload } from './interfaces/pdf-metadata-job-payload.interface';
import { PdfOcrJobPayload } from './interfaces/pdf-ocr-job-payload.interface';
import { Queue } from 'bullmq';

@Injectable()
export class DocumentsService {
  private readonly uploadUrlExpiresInSeconds = 900;
  private readonly viewUrlExpiresInSeconds = 300;

  constructor(
    @InjectQueue('pdf-metadata')
    private readonly pdfMetadataQueue: Queue<PdfMetadataJobPayload>,
    @InjectQueue('pdf-ocr')
    private readonly pdfOcrQueue: Queue<PdfOcrJobPayload>,
    private readonly prismaService: PrismaService,
    private readonly s3Service: S3Service,
    private readonly workerSettingsService: WorkerSettingsService,
  ) {}

  async createUploadSession(
    userId: string,
    dto: CreateDocumentUploadSessionDto,
  ): Promise<DocumentUploadSessionResponse> {
    const documentId = randomUUID();
    const objectKey = this.createOriginalObjectKey(userId, documentId);
    const storageBucket = this.s3Service.getDefaultBucket();
    const expiresAt = new Date(
      Date.now() + this.uploadUrlExpiresInSeconds * 1000,
    );

    await this.prismaService.document.create({
      data: {
        id: documentId,
        ownerId: userId,
        title: dto.title ?? dto.originalFileName,
        originalFileName: dto.originalFileName,
        contentType: 'application/pdf',
        sizeBytes: dto.sizeBytes,
        checksumSha256: dto.checksumSha256,
        storageBucket,
        originalObjectKey: objectKey,
        status: DocumentStatus.UPLOAD_PENDING,
        ocrStatus: DocumentOcrStatus.PENDING,
        uploadExpiresAt: expiresAt,
      },
    });

    const uploadUrl = await this.s3Service.createPutObjectSignedUrl({
      key: objectKey,
      contentType: 'application/pdf',
      expiresInSeconds: this.uploadUrlExpiresInSeconds,
    });

    return {
      documentId,
      uploadUrl,
      method: 'PUT',
      storageBucket,
      objectKey,
      contentType: 'application/pdf',
      expiresAt,
    };
  }

  listDocuments(userId: string): Promise<Document[]> {
    return this.prismaService.document.findMany({
      where: {
        ownerId: userId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocument(
    userId: string,
    documentId: string,
  ): Promise<DocumentDetail> {
    const document = await this.prismaService.document.findFirst({
      where: this.createOwnedDocumentWhere(userId, documentId),
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }

    return document;
  }

  async completeUpload(
    userId: string,
    documentId: string,
    dto: CompleteDocumentUploadDto,
  ): Promise<DocumentDetail> {
    const document = await this.findOwnedDocumentOrThrow(userId, documentId);

    if (document.status !== DocumentStatus.UPLOAD_PENDING) {
      throw new BadRequestException('Document upload is not pending.');
    }

    if (document.uploadExpiresAt && document.uploadExpiresAt < new Date()) {
      throw new BadRequestException('Document upload session is expired.');
    }

    const job = await this.prismaService.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.METADATA_PROCESSING,
          linearizationStatus: DocumentLinearizationStatus.PROCESSING,
          sizeBytes: dto.sizeBytes ?? document.sizeBytes,
          checksumSha256: dto.checksumSha256 ?? document.checksumSha256,
          uploadedAt: new Date(),
        },
      });

      return tx.documentJob.create({
        data: {
          documentId: document.id,
          type: DocumentJobType.PDF_METADATA,
          status: DocumentJobStatus.QUEUED,
          queueName: 'pdf-metadata',
          payload: {
            documentId: document.id,
            objectKey: document.originalObjectKey,
            storageBucket: document.storageBucket,
          },
        },
      });
    });

    try {
      const bullJob = await this.pdfMetadataQueue.add(
        'extract-metadata',
        {
          documentId: document.id,
          objectKey: document.originalObjectKey,
          storageBucket: document.storageBucket,
        },
        {
          jobId: job.id,
          attempts: job.maxAttempts,
          removeOnComplete: false,
          removeOnFail: false,
        },
      );

      await this.prismaService.documentJob.update({
        where: { id: job.id },
        data: { bullJobId: bullJob.id },
      });
    } catch {
      await this.prismaService.$transaction([
        this.prismaService.document.update({
          where: { id: document.id },
          data: { status: DocumentStatus.UPLOADED },
        }),
        this.prismaService.documentJob.update({
          where: { id: job.id },
          data: {
            status: DocumentJobStatus.FAILED,
            errorCode: 'QUEUE_ENQUEUE_FAILED',
            errorMessage: 'Failed to enqueue pdf metadata job.',
            completedAt: new Date(),
          },
        }),
      ]);

      throw new InternalServerErrorException(
        'Failed to enqueue pdf metadata job.',
      );
    }

    return this.getDocument(userId, documentId);
  }

  async createViewUrl(
    userId: string,
    documentId: string,
  ): Promise<DocumentViewResponse> {
    const document = await this.findOwnedDocumentOrThrow(userId, documentId);

    if (!document.uploadedAt || document.status === DocumentStatus.DELETED) {
      throw new BadRequestException('Document is not available for viewing.');
    }

    const viewTarget = this.createViewTarget(document);

    const viewUrl = await this.s3Service.createGetObjectSignedUrl({
      key: viewTarget.objectKey,
      expiresInSeconds: this.viewUrlExpiresInSeconds,
      responseContentDisposition: 'inline',
      responseContentType: 'application/pdf',
    });

    return {
      documentId: document.id,
      viewUrl,
      expiresIn: this.viewUrlExpiresInSeconds,
      isLinearized: viewTarget.isLinearized,
      linearizationStatus: viewTarget.linearizationStatus,
    };
  }

  async getPublicDocument(documentId: string): Promise<DocumentDetail> {
    const document = await this.prismaService.document.findFirst({
      where: this.createPublicDocumentWhere(documentId),
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }

    return document;
  }

  async createPublicViewUrl(documentId: string): Promise<DocumentViewResponse> {
    const document = await this.findPublicDocumentOrThrow(documentId);
    const viewTarget = this.createViewTarget(document);

    const viewUrl = await this.s3Service.createGetObjectSignedUrl({
      key: viewTarget.objectKey,
      expiresInSeconds: this.viewUrlExpiresInSeconds,
      responseContentDisposition: 'inline',
      responseContentType: 'application/pdf',
    });

    return {
      documentId: document.id,
      viewUrl,
      expiresIn: this.viewUrlExpiresInSeconds,
      isLinearized: viewTarget.isLinearized,
      linearizationStatus: viewTarget.linearizationStatus,
    };
  }

  async createPreviewUrl(
    userId: string,
    documentId: string,
  ): Promise<DocumentPreviewResponse> {
    const document = await this.prismaService.document.findFirst({
      where: this.createOwnedDocumentWhere(userId, documentId),
      include: {
        pages: {
          where: { pageNumber: 1 },
          include: {
            derivatives: {
              where: { kind: DocumentPageDerivativeKind.PREVIEW },
              take: 1,
            },
          },
          take: 1,
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }

    if (!document.uploadedAt || document.status === DocumentStatus.DELETED) {
      throw new BadRequestException('Document is not available for preview.');
    }

    const preview = document.pages[0]?.derivatives[0];

    if (!preview) {
      throw new NotFoundException('Document preview was not found.');
    }

    const previewUrl = await this.s3Service.createGetObjectSignedUrl({
      key: preview.objectKey,
      expiresInSeconds: this.viewUrlExpiresInSeconds,
      responseContentDisposition: 'inline',
      responseContentType: preview.contentType,
    });

    return {
      documentId: document.id,
      previewUrl,
      contentType: preview.contentType,
      width: preview.width,
      height: preview.height,
      expiresIn: this.viewUrlExpiresInSeconds,
    };
  }

  async createPublicPreviewUrl(
    documentId: string,
  ): Promise<DocumentPreviewResponse> {
    const document =
      await this.findPublicDocumentWithPreviewOrThrow(documentId);
    const preview = document.pages[0]?.derivatives[0];

    if (!preview) {
      throw new NotFoundException('Document preview was not found.');
    }

    const previewUrl = await this.s3Service.createGetObjectSignedUrl({
      key: preview.objectKey,
      expiresInSeconds: this.viewUrlExpiresInSeconds,
      responseContentDisposition: 'inline',
      responseContentType: preview.contentType,
    });

    return {
      documentId: document.id,
      previewUrl,
      contentType: preview.contentType,
      width: preview.width,
      height: preview.height,
      expiresIn: this.viewUrlExpiresInSeconds,
    };
  }

  async getStatus(
    userId: string,
    documentId: string,
  ): Promise<DocumentStatusResponse> {
    const document = await this.prismaService.document.findFirst({
      where: this.createOwnedDocumentWhere(userId, documentId),
      include: {
        jobs: {
          orderBy: { queuedAt: 'desc' },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }

    return {
      documentId: document.id,
      status: document.status,
      ocrStatus: document.ocrStatus,
      pageCount: document.pageCount,
      hasTextLayer: document.hasTextLayer,
      jobs: document.jobs,
    };
  }

  async reprocessOcr(
    userId: string,
    documentId: string,
  ): Promise<DocumentStatusResponse> {
    const ocrOptions = await this.workerSettingsService.getOcrOptions();
    const job = await this.prismaService.$transaction(async (tx) => {
      const document = await tx.document.findFirst({
        where: this.createOwnedDocumentWhere(userId, documentId),
        include: {
          pages: {
            orderBy: { pageNumber: 'asc' },
          },
        },
      });

      if (!document) {
        throw new NotFoundException('Document was not found.');
      }

      if (!document.uploadedAt || document.status !== DocumentStatus.READY) {
        throw new BadRequestException(
          'Document is not ready for OCR reprocessing.',
        );
      }

      if (document.ocrStatus === DocumentOcrStatus.PROCESSING) {
        throw new BadRequestException('Document OCR is already processing.');
      }

      if (document.pages.length === 0) {
        throw new BadRequestException(
          'Document pages are not available for OCR reprocessing.',
        );
      }

      const payload: PdfOcrJobPayload = {
        documentId: document.id,
        objectKey: document.linearizedObjectKey ?? document.originalObjectKey,
        storageBucket: document.storageBucket,
        ocrOptions,
        pages: document.pages.map((page) => ({
          pageNumber: page.pageNumber,
          width: page.width,
          height: page.height,
          rotation: page.rotation,
        })),
      };

      const createdJob = await tx.documentJob.create({
        data: {
          documentId: document.id,
          type: DocumentJobType.PDF_OCR,
          status: DocumentJobStatus.QUEUED,
          queueName: 'pdf-ocr',
          payload: this.toOcrPayloadJson(payload),
        },
      });

      return {
        id: createdJob.id,
        maxAttempts: createdJob.maxAttempts,
        payload,
      };
    });

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
          where: { id: documentId },
          data: { ocrStatus: DocumentOcrStatus.PROCESSING },
        }),
        this.prismaService.documentJob.update({
          where: { id: job.id },
          data: { bullJobId: bullJob.id },
        }),
      ]);
    } catch {
      await this.prismaService.documentJob.update({
        where: { id: job.id },
        data: {
          status: DocumentJobStatus.FAILED,
          errorCode: 'QUEUE_ENQUEUE_FAILED',
          errorMessage: 'Failed to enqueue pdf OCR job.',
          completedAt: new Date(),
        },
      });

      throw new InternalServerErrorException('Failed to enqueue pdf OCR job.');
    }

    return this.getStatus(userId, documentId);
  }

  async listBookmarks(
    userId: string,
    documentId: string,
  ): Promise<DocumentBookmark[]> {
    await this.findOwnedDocumentOrThrow(userId, documentId);

    return this.prismaService.documentBookmark.findMany({
      where: { documentId },
      orderBy: { pageNumber: 'asc' },
    });
  }

  async saveBookmark(
    userId: string,
    documentId: string,
    pageNumber: number,
  ): Promise<DocumentBookmark> {
    const document = await this.findOwnedDocumentOrThrow(userId, documentId);

    this.assertValidPageNumber(document, pageNumber, 'Bookmark page number');

    return this.prismaService.documentBookmark.upsert({
      where: {
        documentId_pageNumber: {
          documentId,
          pageNumber,
        },
      },
      create: {
        documentId,
        pageNumber,
      },
      update: {},
    });
  }

  async removeBookmark(
    userId: string,
    documentId: string,
    pageNumber: number,
  ): Promise<void> {
    const document = await this.findOwnedDocumentOrThrow(userId, documentId);

    this.assertValidPageNumber(document, pageNumber, 'Bookmark page number');

    await this.prismaService.documentBookmark.deleteMany({
      where: {
        documentId,
        pageNumber,
      },
    });
  }

  async listNotes(userId: string, documentId: string): Promise<DocumentNote[]> {
    await this.findOwnedDocumentOrThrow(userId, documentId);

    return this.prismaService.documentNote.findMany({
      where: { documentId },
      orderBy: { pageNumber: 'asc' },
    });
  }

  async saveNote(
    userId: string,
    documentId: string,
    pageNumber: number,
    content: string,
  ): Promise<DocumentNote> {
    const document = await this.findOwnedDocumentOrThrow(userId, documentId);

    this.assertValidPageNumber(document, pageNumber, 'Note page number');

    const trimmedContent = content.trim();

    if (!trimmedContent) {
      throw new BadRequestException('Note content must not be empty.');
    }

    return this.prismaService.documentNote.upsert({
      where: {
        documentId_pageNumber: {
          documentId,
          pageNumber,
        },
      },
      create: {
        documentId,
        pageNumber,
        content: trimmedContent,
      },
      update: {
        content: trimmedContent,
      },
    });
  }

  async removeNote(
    userId: string,
    documentId: string,
    pageNumber: number,
  ): Promise<void> {
    const document = await this.findOwnedDocumentOrThrow(userId, documentId);

    this.assertValidPageNumber(document, pageNumber, 'Note page number');

    await this.prismaService.documentNote.deleteMany({
      where: {
        documentId,
        pageNumber,
      },
    });
  }

  async updateReadingPosition(
    userId: string,
    documentId: string,
    pageNumber: number,
  ): Promise<void> {
    const document = await this.findOwnedDocumentOrThrow(userId, documentId);

    this.assertValidPageNumber(document, pageNumber, 'Last read page number');

    await this.prismaService.document.update({
      where: { id: documentId },
      data: { lastReadPageNumber: pageNumber },
    });
  }

  async updatePublicAccess(
    userId: string,
    documentId: string,
    isPublic: boolean,
  ): Promise<DocumentDetail> {
    await this.findOwnedDocumentOrThrow(userId, documentId);

    return this.prismaService.document.update({
      where: { id: documentId },
      data: { isPublic },
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    });
  }

  async deleteDocument(userId: string, documentId: string): Promise<void> {
    await this.findOwnedDocumentOrThrow(userId, documentId);

    await this.prismaService.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.DELETED,
        deletedAt: new Date(),
      },
    });
  }

  private async findOwnedDocumentOrThrow(userId: string, documentId: string) {
    const document = await this.prismaService.document.findFirst({
      where: this.createOwnedDocumentWhere(userId, documentId),
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }

    return document;
  }

  private async findPublicDocumentOrThrow(documentId: string) {
    const document = await this.prismaService.document.findFirst({
      where: this.createPublicDocumentWhere(documentId),
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }

    return document;
  }

  private async findPublicDocumentWithPreviewOrThrow(documentId: string) {
    const document = await this.prismaService.document.findFirst({
      where: this.createPublicDocumentWhere(documentId),
      include: {
        pages: {
          where: { pageNumber: 1 },
          include: {
            derivatives: {
              where: { kind: DocumentPageDerivativeKind.PREVIEW },
              take: 1,
            },
          },
          take: 1,
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }

    return document;
  }

  private createOwnedDocumentWhere(
    userId: string,
    documentId: string,
  ): Prisma.DocumentWhereInput {
    return {
      id: documentId,
      ownerId: userId,
      deletedAt: null,
    };
  }

  private createPublicDocumentWhere(
    documentId: string,
  ): Prisma.DocumentWhereInput {
    return {
      id: documentId,
      isPublic: true,
      status: DocumentStatus.READY,
      uploadedAt: { not: null },
      deletedAt: null,
    };
  }

  private createOriginalObjectKey(userId: string, documentId: string): string {
    return `documents/${userId}/${documentId}/original.pdf`;
  }

  private createViewTarget(document: Document): {
    objectKey: string;
    isLinearized: boolean;
    linearizationStatus: DocumentLinearizationStatus;
  } {
    if (
      document.ocrStatus === DocumentOcrStatus.COMPLETED &&
      document.ocrObjectKey
    ) {
      return {
        objectKey: document.ocrObjectKey,
        isLinearized: document.ocrLinearized,
        linearizationStatus: document.ocrLinearized
          ? DocumentLinearizationStatus.READY
          : DocumentLinearizationStatus.UNAVAILABLE,
      };
    }

    if (document.linearizedObjectKey) {
      return {
        objectKey: document.linearizedObjectKey,
        isLinearized: true,
        linearizationStatus: DocumentLinearizationStatus.READY,
      };
    }

    return {
      objectKey: document.originalObjectKey,
      isLinearized: false,
      linearizationStatus: document.linearizationStatus,
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

  private assertValidPageNumber(
    document: Document,
    pageNumber: number,
    fieldName: string,
  ): void {
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new BadRequestException(`${fieldName} must be positive.`);
    }

    if (document.pageCount !== null && pageNumber > document.pageCount) {
      throw new BadRequestException(`${fieldName} is outside the document.`);
    }
  }
}
