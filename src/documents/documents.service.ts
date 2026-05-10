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
  ResourcePermission,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AccessControlService } from '../access-control/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { WorkerSettingsService } from '../worker-settings/worker-settings.service';
import { CompleteDocumentUploadDto } from './dto/complete-document-upload.dto';
import { CreateDocumentThumbnailUploadSessionDto } from './dto/create-document-thumbnail-upload-session.dto';
import { CreateDocumentUploadSessionDto } from './dto/create-document-upload-session.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentDetail } from './interfaces/document-detail.interface';
import { DocumentPreviewResponse } from './interfaces/document-preview-response.interface';
import { DocumentStatusResponse } from './interfaces/document-status-response.interface';
import { DocumentThumbnailUploadSessionResponse } from './interfaces/document-thumbnail-upload-session-response.interface';
import { DocumentUploadSessionResponse } from './interfaces/document-upload-session-response.interface';
import { DocumentViewResponse } from './interfaces/document-view-response.interface';
import { PdfMetadataJobPayload } from './interfaces/pdf-metadata-job-payload.interface';
import { PdfOcrJobPayload } from './interfaces/pdf-ocr-job-payload.interface';
import { Queue } from 'bullmq';

type RestartedDocumentJob =
  | {
      type: typeof DocumentJobType.PDF_METADATA;
      id: string;
      maxAttempts: number;
      payload: PdfMetadataJobPayload;
    }
  | {
      type: typeof DocumentJobType.PDF_OCR;
      id: string;
      maxAttempts: number;
      payload: PdfOcrJobPayload;
    };

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
    private readonly accessControlService: AccessControlService,
  ) {}

  async createUploadSession(
    userId: string,
    dto: CreateDocumentUploadSessionDto,
  ): Promise<DocumentUploadSessionResponse> {
    if (dto.folderId !== undefined) {
      await this.findOwnedFolderOrThrow(userId, dto.folderId);
    }

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
        folderId: dto.folderId,
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

  async listDocuments(
    userId: string,
    folderId?: string,
    role: UserRole = UserRole.USER,
  ): Promise<Document[]> {
    const where = await this.accessControlService.createReadableDocumentWhere(
      userId,
      role,
    );

    if (folderId === 'null') {
      where.folderId = null;
    } else if (folderId !== undefined) {
      this.assertValidUuid(folderId, 'Folder ID');
      await this.findReadableFolderOrThrow(userId, role, folderId);
      where.folderId = folderId;
    }

    return this.prismaService.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocument(
    userId: string,
    documentId: string,
    role: UserRole = UserRole.USER,
  ): Promise<DocumentDetail> {
    const document = await this.prismaService.document.findFirst({
      where: await this.accessControlService.createReadableDocumentWhere(
        userId,
        role,
        documentId,
      ),
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

  async updateDocument(
    userId: string,
    documentId: string,
    dto: UpdateDocumentDto,
    role: UserRole = UserRole.USER,
  ): Promise<DocumentDetail> {
    await this.findManageableDocumentOrThrow(userId, role, documentId);

    const data: Prisma.DocumentUpdateInput = {};

    if (dto.title !== undefined) {
      const title = dto.title.trim();

      if (!title) {
        throw new BadRequestException('Document title must not be empty.');
      }

      data.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(dto, 'folderId')) {
      if (dto.folderId === null) {
        data.folder = { disconnect: true };
      } else if (dto.folderId !== undefined) {
        await this.findOwnedFolderOrThrow(userId, dto.folderId);
        data.folder = { connect: { id: dto.folderId } };
      }
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No document updates were provided.');
    }

    return this.prismaService.document.update({
      where: { id: documentId },
      data,
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    });
  }

  async completeUpload(
    userId: string,
    documentId: string,
    dto: CompleteDocumentUploadDto,
    role: UserRole = UserRole.USER,
  ): Promise<DocumentDetail> {
    const document = await this.findManageableDocumentOrThrow(
      userId,
      role,
      documentId,
    );

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

    return this.getDocument(userId, documentId, role);
  }

  async createViewUrl(
    userId: string,
    documentId: string,
    role: UserRole = UserRole.USER,
  ): Promise<DocumentViewResponse> {
    const document = await this.findReadableDocumentOrThrow(
      userId,
      role,
      documentId,
    );

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
    role: UserRole = UserRole.USER,
  ): Promise<DocumentPreviewResponse> {
    const document = await this.prismaService.document.findFirst({
      where: await this.accessControlService.createReadableDocumentWhere(
        userId,
        role,
        documentId,
      ),
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

  async createThumbnailUploadSession(
    userId: string,
    documentId: string,
    dto: CreateDocumentThumbnailUploadSessionDto,
    role: UserRole = UserRole.USER,
  ): Promise<DocumentThumbnailUploadSessionResponse> {
    const document = await this.prismaService.document.findFirst({
      where:
        role === UserRole.ADMIN
          ? { id: documentId, deletedAt: null }
          : this.createOwnedDocumentWhere(userId, documentId),
      include: {
        pages: {
          where: { pageNumber: 1 },
          take: 1,
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }

    if (!document.uploadedAt || document.status === DocumentStatus.DELETED) {
      throw new BadRequestException(
        'Document is not available for thumbnail update.',
      );
    }

    const page = document.pages[0];

    if (!page) {
      throw new BadRequestException(
        'Document pages are not available for thumbnail update.',
      );
    }

    const objectKey = this.createThumbnailObjectKey(
      userId,
      document.id,
      dto.contentType,
    );
    const storageBucket = this.s3Service.getDefaultBucket();
    const expiresAt = new Date(
      Date.now() + this.uploadUrlExpiresInSeconds * 1000,
    );

    await this.prismaService.documentPageDerivative.upsert({
      where: {
        pageId_kind: {
          pageId: page.id,
          kind: DocumentPageDerivativeKind.THUMBNAIL,
        },
      },
      create: {
        pageId: page.id,
        kind: DocumentPageDerivativeKind.THUMBNAIL,
        storageBucket,
        objectKey,
        contentType: dto.contentType,
        width: dto.width ?? null,
        height: dto.height ?? null,
        sizeBytes: dto.sizeBytes === undefined ? null : BigInt(dto.sizeBytes),
      },
      update: {
        storageBucket,
        objectKey,
        contentType: dto.contentType,
        width: dto.width ?? null,
        height: dto.height ?? null,
        sizeBytes: dto.sizeBytes === undefined ? null : BigInt(dto.sizeBytes),
      },
    });

    const uploadUrl = await this.s3Service.createPutObjectSignedUrl({
      key: objectKey,
      contentType: dto.contentType,
      expiresInSeconds: this.uploadUrlExpiresInSeconds,
    });

    return {
      documentId: document.id,
      uploadUrl,
      method: 'PUT',
      storageBucket,
      objectKey,
      contentType: dto.contentType,
      expiresAt,
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
    role: UserRole = UserRole.USER,
  ): Promise<DocumentStatusResponse> {
    const document = await this.prismaService.document.findFirst({
      where: await this.accessControlService.createReadableDocumentWhere(
        userId,
        role,
        documentId,
      ),
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
    role: UserRole = UserRole.USER,
  ): Promise<DocumentStatusResponse> {
    const ocrOptions = await this.workerSettingsService.getOcrOptions();
    const job = await this.prismaService.$transaction(async (tx) => {
      const document = await tx.document.findFirst({
        where:
          role === UserRole.ADMIN
            ? { id: documentId, deletedAt: null }
            : this.createOwnedDocumentWhere(userId, documentId),
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

  async restartJob(
    userId: string,
    documentId: string,
    jobId: string,
    role: UserRole = UserRole.USER,
  ): Promise<DocumentStatusResponse> {
    const ocrOptions = await this.workerSettingsService.getOcrOptions();
    const job = await this.prismaService.$transaction(async (tx) => {
      const document = await tx.document.findFirst({
        where:
          role === UserRole.ADMIN
            ? { id: documentId, deletedAt: null }
            : this.createOwnedDocumentWhere(userId, documentId),
        include: {
          pages: {
            orderBy: { pageNumber: 'asc' },
          },
        },
      });

      if (!document) {
        throw new NotFoundException('Document was not found.');
      }

      if (!document.uploadedAt || document.status === DocumentStatus.DELETED) {
        throw new BadRequestException(
          'Document is not available for job restart.',
        );
      }

      const previousJob = await tx.documentJob.findFirst({
        where: {
          id: jobId,
          documentId: document.id,
        },
      });

      if (!previousJob) {
        throw new NotFoundException('Document job was not found.');
      }

      if (
        previousJob.status !== DocumentJobStatus.FAILED &&
        previousJob.status !== DocumentJobStatus.CANCELLED
      ) {
        throw new BadRequestException(
          'Only failed or cancelled document jobs can be restarted.',
        );
      }

      await this.assertNoActiveJob(tx, document.id, previousJob.type);

      if (previousJob.type === DocumentJobType.PDF_METADATA) {
        const payload: PdfMetadataJobPayload = {
          documentId: document.id,
          objectKey: document.originalObjectKey,
          storageBucket: document.storageBucket,
        };

        await tx.document.update({
          where: { id: document.id },
          data: {
            status: DocumentStatus.METADATA_PROCESSING,
            linearizationStatus: DocumentLinearizationStatus.PROCESSING,
          },
        });

        const restartedJob = await tx.documentJob.create({
          data: {
            documentId: document.id,
            type: DocumentJobType.PDF_METADATA,
            status: DocumentJobStatus.QUEUED,
            queueName: 'pdf-metadata',
            payload: this.toMetadataPayloadJson(payload),
          },
        });

        return {
          type: DocumentJobType.PDF_METADATA,
          id: restartedJob.id,
          maxAttempts: restartedJob.maxAttempts,
          payload,
        };
      }

      if (previousJob.type === DocumentJobType.PDF_OCR) {
        if (document.status !== DocumentStatus.READY) {
          throw new BadRequestException(
            'Document is not ready for OCR job restart.',
          );
        }

        if (document.ocrStatus === DocumentOcrStatus.PROCESSING) {
          throw new BadRequestException('Document OCR is already processing.');
        }

        if (document.pages.length === 0) {
          throw new BadRequestException(
            'Document pages are not available for OCR job restart.',
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

        const restartedJob = await tx.documentJob.create({
          data: {
            documentId: document.id,
            type: DocumentJobType.PDF_OCR,
            status: DocumentJobStatus.QUEUED,
            queueName: 'pdf-ocr',
            payload: this.toOcrPayloadJson(payload),
          },
        });

        return {
          type: DocumentJobType.PDF_OCR,
          id: restartedJob.id,
          maxAttempts: restartedJob.maxAttempts,
          payload,
        };
      }

      throw new BadRequestException('Document job type cannot be restarted.');
    });

    await this.enqueueRestartedJob(job);

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
    role: UserRole = UserRole.USER,
  ): Promise<DocumentDetail> {
    await this.findManageableDocumentOrThrow(userId, role, documentId);

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

  async deleteDocument(
    userId: string,
    documentId: string,
    role: UserRole = UserRole.USER,
  ): Promise<void> {
    await this.findManageableDocumentOrThrow(userId, role, documentId);

    await this.prismaService.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.DELETED,
        deletedAt: new Date(),
      },
    });
  }

  async listPermissions(userId: string, documentId: string, role: UserRole) {
    await this.accessControlService.assertCanManageDocument(
      userId,
      role,
      documentId,
    );

    const document = await this.prismaService.document.findFirst({
      where: { id: documentId, deletedAt: null },
      include: {
        permissions: {
          include: {
            user: true,
            group: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        folder: {
          include: {
            permissions: {
              include: {
                user: true,
                group: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }

    return {
      direct: document.permissions,
      inheritedFromFolder: document.folder?.permissions ?? [],
    };
  }

  async saveGroupPermission(
    userId: string,
    role: UserRole,
    documentId: string,
    groupId: string,
    permission: ResourcePermission,
  ) {
    await this.accessControlService.assertCanManageDocument(
      userId,
      role,
      documentId,
    );
    await this.findGroupOrThrow(groupId);
    this.assertReadPermission(permission);

    return this.prismaService.documentPermission.upsert({
      where: {
        documentId_groupId: {
          documentId,
          groupId,
        },
      },
      create: {
        documentId,
        groupId,
        permission: ResourcePermission.READ,
      },
      update: {
        permission: ResourcePermission.READ,
      },
    });
  }

  async removeGroupPermission(
    userId: string,
    role: UserRole,
    documentId: string,
    groupId: string,
  ): Promise<void> {
    await this.accessControlService.assertCanManageDocument(
      userId,
      role,
      documentId,
    );

    await this.prismaService.documentPermission.deleteMany({
      where: {
        documentId,
        groupId,
      },
    });
  }

  async saveUserPermission(
    userId: string,
    role: UserRole,
    documentId: string,
    targetUserId: string,
    permission: ResourcePermission,
  ) {
    await this.accessControlService.assertCanManageDocument(
      userId,
      role,
      documentId,
    );
    await this.findUserOrThrow(targetUserId);
    this.assertReadPermission(permission);

    return this.prismaService.documentPermission.upsert({
      where: {
        documentId_userId: {
          documentId,
          userId: targetUserId,
        },
      },
      create: {
        documentId,
        userId: targetUserId,
        permission: ResourcePermission.READ,
      },
      update: {
        permission: ResourcePermission.READ,
      },
    });
  }

  async removeUserPermission(
    userId: string,
    role: UserRole,
    documentId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.accessControlService.assertCanManageDocument(
      userId,
      role,
      documentId,
    );

    await this.prismaService.documentPermission.deleteMany({
      where: {
        documentId,
        userId: targetUserId,
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

  private async findReadableDocumentOrThrow(
    userId: string,
    role: UserRole,
    documentId: string,
  ) {
    const document = await this.prismaService.document.findFirst({
      where: await this.accessControlService.createReadableDocumentWhere(
        userId,
        role,
        documentId,
      ),
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }

    return document;
  }

  private async findManageableDocumentOrThrow(
    userId: string,
    role: UserRole,
    documentId: string,
  ) {
    if (role === UserRole.ADMIN) {
      const document = await this.prismaService.document.findFirst({
        where: {
          id: documentId,
          deletedAt: null,
        },
      });

      if (!document) {
        throw new NotFoundException('Document was not found.');
      }

      return document;
    }

    return this.findOwnedDocumentOrThrow(userId, documentId);
  }

  private async findGroupOrThrow(groupId: string): Promise<void> {
    const group = await this.prismaService.oidcGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('Group was not found.');
    }
  }

  private async findUserOrThrow(userId: string): Promise<void> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User was not found.');
    }
  }

  private assertReadPermission(permission: ResourcePermission): void {
    if (permission !== ResourcePermission.READ) {
      throw new BadRequestException('Only READ permission is supported.');
    }
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

  private async findOwnedFolderOrThrow(userId: string, folderId: string) {
    const folder = await this.prismaService.folder.findFirst({
      where: {
        id: folderId,
        ownerId: userId,
      },
    });

    if (!folder) {
      throw new NotFoundException('Folder was not found.');
    }

    return folder;
  }

  private async findReadableFolderOrThrow(
    userId: string,
    role: UserRole,
    folderId: string,
  ) {
    const folder = await this.prismaService.folder.findFirst({
      where: await this.accessControlService.createReadableFolderWhere(
        userId,
        role,
        folderId,
      ),
    });

    if (!folder) {
      throw new NotFoundException('Folder was not found.');
    }

    return folder;
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
      status: DocumentStatus.READY,
      uploadedAt: { not: null },
      deletedAt: null,
      OR: [{ isPublic: true }, { folder: { isPublic: true } }],
    };
  }

  private createOriginalObjectKey(userId: string, documentId: string): string {
    return `documents/${userId}/${documentId}/original.pdf`;
  }

  private assertValidUuid(value: string, fieldName: string): void {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(value)) {
      throw new BadRequestException(`${fieldName} must be a UUID.`);
    }
  }

  private createThumbnailObjectKey(
    userId: string,
    documentId: string,
    contentType: string,
  ): string {
    const extensionByContentType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };

    return `documents/${userId}/${documentId}/thumbnails/${randomUUID()}.${
      extensionByContentType[contentType]
    }`;
  }

  private async assertNoActiveJob(
    tx: Prisma.TransactionClient,
    documentId: string,
    type: DocumentJobType,
  ): Promise<void> {
    const activeJob = await tx.documentJob.findFirst({
      where: {
        documentId,
        type,
        status: {
          in: [
            DocumentJobStatus.QUEUED,
            DocumentJobStatus.ACTIVE,
            DocumentJobStatus.RETRYING,
          ],
        },
      },
    });

    if (activeJob) {
      throw new BadRequestException(
        'A document job of this type is already running.',
      );
    }
  }

  private async enqueueRestartedJob(job: RestartedDocumentJob): Promise<void> {
    if (job.type === DocumentJobType.PDF_METADATA) {
      await this.enqueueRestartedMetadataJob(job);
      return;
    }

    await this.enqueueRestartedOcrJob(job);
  }

  private async enqueueRestartedMetadataJob(
    job: Extract<
      RestartedDocumentJob,
      { type: typeof DocumentJobType.PDF_METADATA }
    >,
  ): Promise<void> {
    try {
      const bullJob = await this.pdfMetadataQueue.add(
        'extract-metadata',
        job.payload,
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
          where: { id: job.payload.documentId },
          data: { status: DocumentStatus.PROCESSING_FAILED },
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
  }

  private async enqueueRestartedOcrJob(
    job: Extract<
      RestartedDocumentJob,
      { type: typeof DocumentJobType.PDF_OCR }
    >,
  ): Promise<void> {
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
      ]);

      throw new InternalServerErrorException('Failed to enqueue pdf OCR job.');
    }
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

  private toMetadataPayloadJson(
    payload: PdfMetadataJobPayload,
  ): Prisma.InputJsonObject {
    return {
      documentId: payload.documentId,
      objectKey: payload.objectKey,
      storageBucket: payload.storageBucket,
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
