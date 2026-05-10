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
import {
  AuditAction,
  AuditResourceType,
  OidcGroup,
  UserRole,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
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
  constructor(
    private readonly groupsService: GroupsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  listGroups(@Req() request: AuthenticatedRequest): Promise<OidcGroup[]> {
    this.assertAdmin(request);
    return this.groupsService.listGroups();
  }

  @Post()
  async createGroup(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateGroupDto,
  ): Promise<OidcGroup> {
    this.assertAdmin(request);
    const group = await this.groupsService.createGroup(dto);

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.GROUP_CREATE,
      resourceType: AuditResourceType.GROUP,
      resourceId: group.id,
      summary: `Group created: ${group.externalId}`,
      after: {
        externalId: group.externalId,
        displayName: group.displayName,
      },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return group;
  }

  @Patch(':id')
  async updateGroup(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateGroupDto,
  ): Promise<OidcGroup> {
    this.assertAdmin(request);
    const group = await this.groupsService.updateGroup(groupId, dto);

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.GROUP_UPDATE,
      resourceType: AuditResourceType.GROUP,
      resourceId: group.id,
      summary: `Group updated: ${group.externalId}`,
      after: {
        displayName: group.displayName,
        description: group.description,
      },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return group;
  }

  private assertAdmin(request: AuthenticatedRequest): void {
    if (request.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can manage groups.');
    }
  }
}
