import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import { OidcGroup, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupResponseDto } from './dto/group-response.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(JwtAuthGuard)
@SerializeOptions({ strategy: 'excludeAll', type: GroupResponseDto })
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  listGroups(@Req() request: AuthenticatedRequest): Promise<OidcGroup[]> {
    this.assertAdmin(request);
    return this.groupsService.listGroups();
  }

  @Post()
  createGroup(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateGroupDto,
  ): Promise<OidcGroup> {
    this.assertAdmin(request);
    return this.groupsService.createGroup(dto);
  }

  @Patch(':id')
  updateGroup(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateGroupDto,
  ): Promise<OidcGroup> {
    this.assertAdmin(request);
    return this.groupsService.updateGroup(groupId, dto);
  }

  private assertAdmin(request: AuthenticatedRequest): void {
    if (request.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can manage groups.');
    }
  }
}
