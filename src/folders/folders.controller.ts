import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import { Folder } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreateFolderDto } from './dto/create-folder.dto';
import { FolderResponseDto } from './dto/folder-response.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
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
    return this.foldersService.listFolders(request.user.sub);
  }

  @Get(':id')
  @SerializeOptions({ type: FolderResponseDto })
  getFolder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
  ): Promise<Folder> {
    return this.foldersService.getFolder(request.user.sub, folderId);
  }

  @Patch(':id')
  @SerializeOptions({ type: FolderResponseDto })
  updateFolder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Body() dto: UpdateFolderDto,
  ): Promise<Folder> {
    return this.foldersService.updateFolder(request.user.sub, folderId, dto);
  }

  @Delete(':id')
  deleteFolder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) folderId: string,
  ): Promise<void> {
    return this.foldersService.deleteFolder(request.user.sub, folderId);
  }
}
