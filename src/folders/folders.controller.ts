import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import {
  AuditAction,
  AuditResourceType,
  Folder,
  FolderPermission,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreateFolderDto } from './dto/create-folder.dto';
import { FolderPermissionResponseDto } from './dto/folder-permission-response.dto';
import { FolderResponseDto } from './dto/folder-response.dto';
import { SaveFolderPermissionDto } from './dto/save-folder-permission.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { UpdateFolderPublicAccessDto } from './dto/update-folder-public-access.dto';
import { FoldersService } from './folders.service';

@Controller('folders')
@UseGuards(JwtAuthGuard)
@SerializeOptions({ strategy: 'excludeAll' })
export class FoldersController {
  constructor(
    private readonly foldersService: FoldersService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Post()
  @SerializeOptions({ type: FolderResponseDto })
  async createFolder(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateFolderDto,
  ): Promise<Folder> {
    const folder = await this.foldersService.createFolder(
      request.user.sub,
      dto,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.FOLDER_CREATE,
      resourceType: AuditResourceType.FOLDER,
      resourceId: folder.id,
      summary: `Folder created: ${folder.name}`,
      after: { name: folder.name },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return folder;
  }

  @Get()
  @SerializeOptions({ type: FolderResponseDto })
  listFolders(@Req() request: AuthenticatedRequest): Promise<Folder[]> {
    return this.foldersService.listFolders(request.user.sub, request.user.role);
  }

  @Get(':id')
  @SerializeOptions({ type: FolderResponseDto })
  getFolder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
  ): Promise<Folder> {
    return this.foldersService.getFolder(
      request.user.sub,
      folderId,
      request.user.role,
    );
  }

  @Get(':id/permissions')
  @SerializeOptions({ type: FolderPermissionResponseDto })
  listPermissions(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
  ): Promise<FolderPermission[]> {
    return this.foldersService.listPermissions(
      request.user.sub,
      request.user.role,
      folderId,
    );
  }

  @Patch(':id')
  @SerializeOptions({ type: FolderResponseDto })
  async updateFolder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Body() dto: UpdateFolderDto,
  ): Promise<Folder> {
    const folder = await this.foldersService.updateFolder(
      request.user.sub,
      folderId,
      dto,
      request.user.role,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.FOLDER_UPDATE,
      resourceType: AuditResourceType.FOLDER,
      resourceId: folder.id,
      summary: `Folder updated: ${folder.name}`,
      after: { name: folder.name },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return folder;
  }

  @Patch(':id/public-access')
  @SerializeOptions({ type: FolderResponseDto })
  async updatePublicAccess(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Body() dto: UpdateFolderPublicAccessDto,
  ): Promise<Folder> {
    const folder = await this.foldersService.updatePublicAccess(
      request.user.sub,
      request.user.role,
      folderId,
      dto.isPublic,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.FOLDER_PUBLIC_ACCESS_UPDATE,
      resourceType: AuditResourceType.FOLDER,
      resourceId: folder.id,
      summary: `Folder public access ${folder.isPublic ? 'enabled' : 'disabled'}.`,
      after: { isPublic: folder.isPublic },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return folder;
  }

  @Put(':id/permissions/groups/:groupId')
  @SerializeOptions({ type: FolderPermissionResponseDto })
  async saveGroupPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: SaveFolderPermissionDto,
  ): Promise<FolderPermission> {
    const permission = await this.foldersService.saveGroupPermission(
      request.user.sub,
      request.user.role,
      folderId,
      groupId,
      dto.permission,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.FOLDER_PERMISSION_GRANT,
      resourceType: AuditResourceType.FOLDER,
      resourceId: folderId,
      summary: `Folder group permission granted to ${groupId}.`,
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
    @Param('id', ParseUUIDPipe) folderId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    await this.foldersService.removeGroupPermission(
      request.user.sub,
      request.user.role,
      folderId,
      groupId,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.FOLDER_PERMISSION_REVOKE,
      resourceType: AuditResourceType.FOLDER,
      resourceId: folderId,
      summary: `Folder group permission revoked from ${groupId}.`,
      before: { groupId },
      ...this.auditLogsService.createRequestMetadata(request),
    });
  }

  @Put(':id/permissions/users/:userId')
  @SerializeOptions({ type: FolderPermissionResponseDto })
  async saveUserPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() dto: SaveFolderPermissionDto,
  ): Promise<FolderPermission> {
    const permission = await this.foldersService.saveUserPermission(
      request.user.sub,
      request.user.role,
      folderId,
      targetUserId,
      dto.permission,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.FOLDER_PERMISSION_GRANT,
      resourceType: AuditResourceType.FOLDER,
      resourceId: folderId,
      summary: `Folder user permission granted to ${targetUserId}.`,
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
    @Param('id', ParseUUIDPipe) folderId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ): Promise<void> {
    await this.foldersService.removeUserPermission(
      request.user.sub,
      request.user.role,
      folderId,
      targetUserId,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.FOLDER_PERMISSION_REVOKE,
      resourceType: AuditResourceType.FOLDER,
      resourceId: folderId,
      summary: `Folder user permission revoked from ${targetUserId}.`,
      before: { userId: targetUserId },
      ...this.auditLogsService.createRequestMetadata(request),
    });
  }

  @Delete(':id')
  async deleteFolder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
  ): Promise<void> {
    await this.foldersService.deleteFolder(
      request.user.sub,
      folderId,
      request.user.role,
    );

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.FOLDER_DELETE,
      resourceType: AuditResourceType.FOLDER,
      resourceId: folderId,
      summary: 'Folder deleted.',
      before: { folderId },
      ...this.auditLogsService.createRequestMetadata(request),
    });
  }
}
