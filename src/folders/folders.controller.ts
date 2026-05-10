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
import { Folder, FolderPermission } from '@prisma/client';
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
  constructor(private readonly foldersService: FoldersService) {}

  @Post()
  @SerializeOptions({ type: FolderResponseDto })
  createFolder(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateFolderDto,
  ): Promise<Folder> {
    return this.foldersService.createFolder(request.user.sub, dto);
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
  updateFolder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Body() dto: UpdateFolderDto,
  ): Promise<Folder> {
    return this.foldersService.updateFolder(
      request.user.sub,
      folderId,
      dto,
      request.user.role,
    );
  }

  @Patch(':id/public-access')
  @SerializeOptions({ type: FolderResponseDto })
  updatePublicAccess(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Body() dto: UpdateFolderPublicAccessDto,
  ): Promise<Folder> {
    return this.foldersService.updatePublicAccess(
      request.user.sub,
      request.user.role,
      folderId,
      dto.isPublic,
    );
  }

  @Put(':id/permissions/groups/:groupId')
  @SerializeOptions({ type: FolderPermissionResponseDto })
  saveGroupPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: SaveFolderPermissionDto,
  ): Promise<FolderPermission> {
    return this.foldersService.saveGroupPermission(
      request.user.sub,
      request.user.role,
      folderId,
      groupId,
      dto.permission,
    );
  }

  @Delete(':id/permissions/groups/:groupId')
  removeGroupPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    return this.foldersService.removeGroupPermission(
      request.user.sub,
      request.user.role,
      folderId,
      groupId,
    );
  }

  @Put(':id/permissions/users/:userId')
  @SerializeOptions({ type: FolderPermissionResponseDto })
  saveUserPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() dto: SaveFolderPermissionDto,
  ): Promise<FolderPermission> {
    return this.foldersService.saveUserPermission(
      request.user.sub,
      request.user.role,
      folderId,
      targetUserId,
      dto.permission,
    );
  }

  @Delete(':id/permissions/users/:userId')
  removeUserPermission(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ): Promise<void> {
    return this.foldersService.removeUserPermission(
      request.user.sub,
      request.user.role,
      folderId,
      targetUserId,
    );
  }

  @Delete(':id')
  deleteFolder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
  ): Promise<void> {
    return this.foldersService.deleteFolder(
      request.user.sub,
      folderId,
      request.user.role,
    );
  }
}
