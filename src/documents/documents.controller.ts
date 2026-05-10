import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import {
  AuditAction,
  AuditResourceType,
  Document,
  DocumentPermission,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreateDocumentThumbnailUploadSessionDto } from './dto/create-document-thumbnail-upload-session.dto';
import { CompleteDocumentUploadDto } from './dto/complete-document-upload.dto';
import { CreateDocumentUploadSessionDto } from './dto/create-document-upload-session.dto';
import { DocumentBookmarkResponseDto } from './dto/document-bookmark-response.dto';
import { DocumentNoteResponseDto } from './dto/document-note-response.dto';
import { DocumentPreviewResponseDto } from './dto/document-preview-response.dto';
import { DocumentResponseDto } from './dto/document-response.dto';
import {
  DocumentPermissionsResponseDto,
  ResourcePermissionResponseDto,
} from './dto/resource-permission-response.dto';
import { SaveResourcePermissionDto } from './dto/save-resource-permission.dto';
import { DocumentStatusResponseDto } from './dto/document-status-response.dto';
import { DocumentThumbnailUploadSessionResponseDto } from './dto/document-thumbnail-upload-session-response.dto';
import { DocumentUploadSessionResponseDto } from './dto/document-upload-session-response.dto';
import { DocumentViewResponseDto } from './dto/document-view-response.dto';
import { SaveDocumentNoteDto } from './dto/save-document-note.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UpdateDocumentPublicAccessDto } from './dto/update-document-public-access.dto';
import { UpdateDocumentReadingPositionDto } from './dto/update-document-reading-position.dto';
import { DocumentsService } from './documents.service';
import { DocumentBookmarkResponse } from './interfaces/document-bookmark-response.interface';
import { DocumentDetail } from './interfaces/document-detail.interface';
import { DocumentNoteResponse } from './interfaces/document-note-response.interface';
import { DocumentPreviewResponse } from './interfaces/document-preview-response.interface';
import { DocumentStatusResponse } from './interfaces/document-status-response.interface';
import { DocumentThumbnailUploadSessionResponse } from './interfaces/document-thumbnail-upload-session-response.interface';
import { DocumentUploadSessionResponse } from './interfaces/document-upload-session-response.interface';
import { DocumentViewResponse } from './interfaces/document-view-response.interface';

@Controller('documents')
@UseGuards(JwtAuthGuard)
@SerializeOptions({ strategy: 'excludeAll' })
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Post('upload-session')
  @SerializeOptions({ type: DocumentUploadSessionResponseDto })
  async createUploadSession(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateDocumentUploadSessionDto,
  ): Promise<DocumentUploadSessionResponse> {
    const response = await this.documentsService.createUploadSession(
      request.user.sub,
      dto,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_CREATE_UPLOAD_SESSION,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: response.documentId,
      summary: `Document upload session created: ${dto.originalFileName}`,
      after: {
        title: dto.title ?? dto.originalFileName,
        originalFileName: dto.originalFileName,
        folderId: dto.folderId ?? null,
      },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return response;
  }

  @Get()
  @SerializeOptions({ type: DocumentResponseDto })
  listDocuments(
    @Req() request: AuthenticatedRequest,
    @Query('folderId') folderId?: string,
  ): Promise<Document[]> {
    return this.documentsService.listDocuments(
      request.user.sub,
      folderId,
      request.user.role,
    );
  }

  @Get('statuses')
  @SerializeOptions({ type: DocumentStatusResponseDto })
  listStatuses(
    @Req() request: AuthenticatedRequest,
  ): Promise<DocumentStatusResponse[]> {
    return this.documentsService.listStatuses(
      request.user.sub,
      request.user.role,
    );
  }

  @Get(':id')
  @SerializeOptions({ type: DocumentResponseDto })
  async getDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentDetail> {
    const document = await this.documentsService.getDocument(
      request.user.sub,
      documentId,
      request.user.role,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_READ,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: document.id,
      summary: `Document read: ${document.title}`,
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return document;
  }

  @Patch(':id')
  @SerializeOptions({ type: DocumentResponseDto })
  async updateDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateDocumentDto,
  ): Promise<DocumentDetail> {
    const document = await this.documentsService.updateDocument(
      request.user.sub,
      documentId,
      dto,
      request.user.role,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_UPDATE,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: document.id,
      summary: `Document updated: ${document.title}`,
      after: {
        title: document.title,
        folderId: document.folderId,
      },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return document;
  }

  @Post(':id/complete')
  @SerializeOptions({ type: DocumentResponseDto })
  async completeUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Body() dto: CompleteDocumentUploadDto,
  ): Promise<DocumentDetail> {
    const document = await this.documentsService.completeUpload(
      request.user.sub,
      documentId,
      dto,
      request.user.role,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_COMPLETE_UPLOAD,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: document.id,
      summary: `Document upload completed: ${document.title}`,
      after: {
        status: document.status,
        sizeBytes: document.sizeBytes?.toString() ?? null,
        checksumSha256: document.checksumSha256,
      },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return document;
  }

  @Get(':id/view')
  @SerializeOptions({ type: DocumentViewResponseDto })
  async createViewUrl(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentViewResponse> {
    const response = await this.documentsService.createViewUrl(
      request.user.sub,
      documentId,
      request.user.role,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_VIEW,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: response.documentId,
      summary: 'Document view URL created.',
      after: { isLinearized: response.isLinearized },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return response;
  }

  @Get(':id/preview')
  @SerializeOptions({ type: DocumentPreviewResponseDto })
  async createPreviewUrl(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentPreviewResponse> {
    return this.documentsService.createPreviewUrl(
      request.user.sub,
      documentId,
      request.user.role,
    );
  }

  @Post(':id/thumbnail/upload-session')
  @SerializeOptions({ type: DocumentThumbnailUploadSessionResponseDto })
  createThumbnailUploadSession(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Body() dto: CreateDocumentThumbnailUploadSessionDto,
  ): Promise<DocumentThumbnailUploadSessionResponse> {
    return this.documentsService.createThumbnailUploadSession(
      request.user.sub,
      documentId,
      dto,
      request.user.role,
    );
  }

  @Get(':id/status')
  @SerializeOptions({ type: DocumentStatusResponseDto })
  getStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentStatusResponse> {
    return this.documentsService.getStatus(
      request.user.sub,
      documentId,
      request.user.role,
    );
  }

  @Put(':id/reading-position')
  updateReadingPosition(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateDocumentReadingPositionDto,
  ): Promise<void> {
    return this.documentsService.updateReadingPosition(
      request.user.sub,
      documentId,
      dto.pageNumber,
      request.user.role,
    );
  }

  @Patch(':id/public-access')
  @SerializeOptions({ type: DocumentResponseDto })
  async updatePublicAccess(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateDocumentPublicAccessDto,
  ): Promise<DocumentDetail> {
    const document = await this.documentsService.updatePublicAccess(
      request.user.sub,
      documentId,
      dto.isPublic,
      request.user.role,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_PUBLIC_ACCESS_UPDATE,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: document.id,
      summary: `Document public access ${document.isPublic ? 'enabled' : 'disabled'}.`,
      after: { isPublic: document.isPublic },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return document;
  }

  @Get(':id/permissions')
  @SerializeOptions({ type: DocumentPermissionsResponseDto })
  listPermissions(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ) {
    return this.documentsService.listPermissions(
      request.user.sub,
      documentId,
      request.user.role,
    );
  }

  @Put(':id/permissions/groups/:groupId')
  @SerializeOptions({ type: ResourcePermissionResponseDto })
  async saveGroupPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: SaveResourcePermissionDto,
  ): Promise<DocumentPermission> {
    const permission = await this.documentsService.saveGroupPermission(
      request.user.sub,
      request.user.role,
      documentId,
      groupId,
      dto.permission,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_PERMISSION_GRANT,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: documentId,
      summary: `Document group permission granted to ${groupId}.`,
      after: {
        permissionId: permission.id,
        groupId,
        permission: permission.permission,
      },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return permission;
  }

  @Delete(':id/permissions/groups/:groupId')
  async removeGroupPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    await this.documentsService.removeGroupPermission(
      request.user.sub,
      request.user.role,
      documentId,
      groupId,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_PERMISSION_REVOKE,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: documentId,
      summary: `Document group permission revoked from ${groupId}.`,
      before: { groupId },
      ...this.auditLogsService.createRequestMetadata(request),
    });
  }

  @Put(':id/permissions/users/:userId')
  @SerializeOptions({ type: ResourcePermissionResponseDto })
  async saveUserPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() dto: SaveResourcePermissionDto,
  ): Promise<DocumentPermission> {
    const permission = await this.documentsService.saveUserPermission(
      request.user.sub,
      request.user.role,
      documentId,
      targetUserId,
      dto.permission,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_PERMISSION_GRANT,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: documentId,
      summary: `Document user permission granted to ${targetUserId}.`,
      after: {
        permissionId: permission.id,
        userId: targetUserId,
        permission: permission.permission,
      },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return permission;
  }

  @Delete(':id/permissions/users/:userId')
  async removeUserPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ): Promise<void> {
    await this.documentsService.removeUserPermission(
      request.user.sub,
      request.user.role,
      documentId,
      targetUserId,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_PERMISSION_REVOKE,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: documentId,
      summary: `Document user permission revoked from ${targetUserId}.`,
      before: { userId: targetUserId },
      ...this.auditLogsService.createRequestMetadata(request),
    });
  }

  @Post(':id/ocr/reprocess')
  @SerializeOptions({ type: DocumentStatusResponseDto })
  async reprocessOcr(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentStatusResponse> {
    const response = await this.documentsService.reprocessOcr(
      request.user.sub,
      documentId,
      request.user.role,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_OCR_REPROCESS,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: documentId,
      summary: 'Document OCR reprocess requested.',
      after: { ocrStatus: response.ocrStatus },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return response;
  }

  @Post(':id/jobs/:jobId/restart')
  @SerializeOptions({ type: DocumentStatusResponseDto })
  async restartJob(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<DocumentStatusResponse> {
    const response = await this.documentsService.restartJob(
      request.user.sub,
      documentId,
      jobId,
      request.user.role,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_JOB_RESTART,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: documentId,
      summary: `Document job restarted: ${jobId}`,
      after: { jobId, status: response.status, ocrStatus: response.ocrStatus },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return response;
  }

  @Get(':id/bookmarks')
  @SerializeOptions({ type: DocumentBookmarkResponseDto })
  listBookmarks(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentBookmarkResponse[]> {
    return this.documentsService.listBookmarks(
      request.user.sub,
      documentId,
      request.user.role,
    );
  }

  @Put(':id/bookmarks/:pageNumber')
  @SerializeOptions({ type: DocumentBookmarkResponseDto })
  saveBookmark(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
  ): Promise<DocumentBookmarkResponse> {
    return this.documentsService.saveBookmark(
      request.user.sub,
      documentId,
      pageNumber,
      request.user.role,
    );
  }

  @Delete(':id/bookmarks/:pageNumber')
  removeBookmark(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
  ): Promise<void> {
    return this.documentsService.removeBookmark(
      request.user.sub,
      documentId,
      pageNumber,
      request.user.role,
    );
  }

  @Get(':id/notes')
  @SerializeOptions({ type: DocumentNoteResponseDto })
  listNotes(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentNoteResponse[]> {
    return this.documentsService.listNotes(
      request.user.sub,
      documentId,
      request.user.role,
    );
  }

  @Put(':id/notes/:pageNumber')
  @SerializeOptions({ type: DocumentNoteResponseDto })
  saveNote(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
    @Body() dto: SaveDocumentNoteDto,
  ): Promise<DocumentNoteResponse> {
    return this.documentsService.saveNote(
      request.user.sub,
      documentId,
      pageNumber,
      dto.content,
      request.user.role,
    );
  }

  @Delete(':id/notes/:pageNumber')
  removeNote(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
  ): Promise<void> {
    return this.documentsService.removeNote(
      request.user.sub,
      documentId,
      pageNumber,
      request.user.role,
    );
  }

  @Delete(':id')
  async deleteDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    await this.documentsService.deleteDocument(
      request.user.sub,
      documentId,
      request.user.role,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.DOCUMENT_DELETE,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: documentId,
      summary: 'Document deleted.',
      before: { documentId },
      ...this.auditLogsService.createRequestMetadata(request),
    });
  }
}

@Controller('public/documents')
@SerializeOptions({ strategy: 'excludeAll' })
export class PublicDocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get(':id')
  @SerializeOptions({ type: DocumentResponseDto })
  async getPublicDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentDetail> {
    const document = await this.documentsService.getPublicDocument(documentId);

    await this.auditLogsService.record({
      actorId: null,
      action: AuditAction.DOCUMENT_READ,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: document.id,
      summary: `Public document read: ${document.title}`,
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return document;
  }

  @Get(':id/view')
  @SerializeOptions({ type: DocumentViewResponseDto })
  async createPublicViewUrl(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentViewResponse> {
    const response =
      await this.documentsService.createPublicViewUrl(documentId);

    await this.auditLogsService.record({
      actorId: null,
      action: AuditAction.DOCUMENT_VIEW,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: response.documentId,
      summary: 'Public document view URL created.',
      after: { isLinearized: response.isLinearized },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return response;
  }

  @Get(':id/preview')
  @SerializeOptions({ type: DocumentPreviewResponseDto })
  async createPublicPreviewUrl(
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentPreviewResponse> {
    return this.documentsService.createPublicPreviewUrl(documentId);
  }
}
