import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import { AuditAction, AuditResourceType, User, UserRole } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
@SerializeOptions({ strategy: 'excludeAll', type: UserResponseDto })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  listUsers(@Req() request: AuthenticatedRequest): Promise<User[]> {
    this.assertAdmin(request);
    return this.usersService.listUsers();
  }

  @Get(':id')
  getUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) userId: string,
  ): Promise<User> {
    this.assertAdmin(request);
    return this.usersService.getUser(userId);
  }

  @Put(':id')
  async updateUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    this.assertAdmin(request);
    const user = await this.usersService.updateUser(userId, dto);

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.USER_UPDATE,
      resourceType: AuditResourceType.USER,
      resourceId: user.id,
      summary: `User updated: ${user.email ?? user.id}`,
      after: {
        role: user.role,
        groupIds: dto.groupIds,
      },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return user;
  }

  private assertAdmin(request: AuthenticatedRequest): void {
    if (request.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can manage users.');
    }
  }
}
