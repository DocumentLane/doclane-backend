import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import { AuditLog, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard)
@SerializeOptions({ strategy: 'excludeAll', type: AuditLogResponseDto })
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  listAuditLogs(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<AuditLog[]> {
    if (request.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can view audit logs.');
    }

    return this.auditLogsService.list(query);
  }
}
