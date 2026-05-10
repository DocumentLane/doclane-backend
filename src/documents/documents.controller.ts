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
import { Document, DocumentPermission } from '@prisma/client';
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
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload-session')
  @SerializeOptions({ type: DocumentUploadSessionResponseDto })
  createUploadSession(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateDocumentUploadSessionDto,
  ): Promise<DocumentUploadSessionResponse> {
    return this.documentsService.createUploadSession(request.user.sub, dto);
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

  @Get(':id')
  @SerializeOptions({ type: DocumentResponseDto })
  getDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentDetail> {
    return this.documentsService.getDocument(
      request.user.sub,
      documentId,
      request.user.role,
    );
  }

  @Patch(':id')
  @SerializeOptions({ type: DocumentResponseDto })
  updateDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateDocumentDto,
  ): Promise<DocumentDetail> {
    return this.documentsService.updateDocument(
      request.user.sub,
      documentId,
      dto,
      request.user.role,
    );
  }

  @Post(':id/complete')
  @SerializeOptions({ type: DocumentResponseDto })
  completeUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Body() dto: CompleteDocumentUploadDto,
  ): Promise<DocumentDetail> {
    return this.documentsService.completeUpload(
      request.user.sub,
      documentId,
      dto,
      request.user.role,
    );
  }

  @Get(':id/view')
  @SerializeOptions({ type: DocumentViewResponseDto })
  createViewUrl(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentViewResponse> {
    return this.documentsService.createViewUrl(
      request.user.sub,
      documentId,
      request.user.role,
    );
  }

  @Get(':id/preview')
  @SerializeOptions({ type: DocumentPreviewResponseDto })
  createPreviewUrl(
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
    );
  }

  @Patch(':id/public-access')
  @SerializeOptions({ type: DocumentResponseDto })
  updatePublicAccess(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateDocumentPublicAccessDto,
  ): Promise<DocumentDetail> {
    return this.documentsService.updatePublicAccess(
      request.user.sub,
      documentId,
      dto.isPublic,
      request.user.role,
    );
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
  saveGroupPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: SaveResourcePermissionDto,
  ): Promise<DocumentPermission> {
    return this.documentsService.saveGroupPermission(
      request.user.sub,
      request.user.role,
      documentId,
      groupId,
      dto.permission,
    );
  }

  @Delete(':id/permissions/groups/:groupId')
  removeGroupPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    return this.documentsService.removeGroupPermission(
      request.user.sub,
      request.user.role,
      documentId,
      groupId,
    );
  }

  @Put(':id/permissions/users/:userId')
  @SerializeOptions({ type: ResourcePermissionResponseDto })
  saveUserPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() dto: SaveResourcePermissionDto,
  ): Promise<DocumentPermission> {
    return this.documentsService.saveUserPermission(
      request.user.sub,
      request.user.role,
      documentId,
      targetUserId,
      dto.permission,
    );
  }

  @Delete(':id/permissions/users/:userId')
  removeUserPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ): Promise<void> {
    return this.documentsService.removeUserPermission(
      request.user.sub,
      request.user.role,
      documentId,
      targetUserId,
    );
  }

  @Post(':id/ocr/reprocess')
  @SerializeOptions({ type: DocumentStatusResponseDto })
  reprocessOcr(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentStatusResponse> {
    return this.documentsService.reprocessOcr(
      request.user.sub,
      documentId,
      request.user.role,
    );
  }

  @Post(':id/jobs/:jobId/restart')
  @SerializeOptions({ type: DocumentStatusResponseDto })
  restartJob(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<DocumentStatusResponse> {
    return this.documentsService.restartJob(
      request.user.sub,
      documentId,
      jobId,
      request.user.role,
    );
  }

  @Get(':id/bookmarks')
  @SerializeOptions({ type: DocumentBookmarkResponseDto })
  listBookmarks(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentBookmarkResponse[]> {
    return this.documentsService.listBookmarks(request.user.sub, documentId);
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
    );
  }

  @Get(':id/notes')
  @SerializeOptions({ type: DocumentNoteResponseDto })
  listNotes(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentNoteResponse[]> {
    return this.documentsService.listNotes(request.user.sub, documentId);
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
    );
  }

  @Delete(':id')
  deleteDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    return this.documentsService.deleteDocument(
      request.user.sub,
      documentId,
      request.user.role,
    );
  }
}

@Controller('public/documents')
@SerializeOptions({ strategy: 'excludeAll' })
export class PublicDocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get(':id')
  @SerializeOptions({ type: DocumentResponseDto })
  getPublicDocument(
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentDetail> {
    return this.documentsService.getPublicDocument(documentId);
  }

  @Get(':id/view')
  @SerializeOptions({ type: DocumentViewResponseDto })
  createPublicViewUrl(
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentViewResponse> {
    return this.documentsService.createPublicViewUrl(documentId);
  }

  @Get(':id/preview')
  @SerializeOptions({ type: DocumentPreviewResponseDto })
  createPublicPreviewUrl(
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentPreviewResponse> {
    return this.documentsService.createPublicPreviewUrl(documentId);
  }
}
