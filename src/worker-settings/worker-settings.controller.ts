import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Req,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import {
  AuditAction,
  AuditResourceType,
  UserRole,
  WorkerSettings,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { UpdateWorkerSettingsDto } from './dto/update-worker-settings.dto';
import { WorkerSettingsResponseDto } from './dto/worker-settings-response.dto';
import { WorkerSettingsService } from './worker-settings.service';

@Controller('worker-settings')
@UseGuards(JwtAuthGuard)
@SerializeOptions({ strategy: 'excludeAll', type: WorkerSettingsResponseDto })
export class WorkerSettingsController {
  constructor(
    private readonly workerSettingsService: WorkerSettingsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  getSettings(): Promise<WorkerSettings> {
    return this.workerSettingsService.getSettings();
  }

  @Patch()
  async updateSettings(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateWorkerSettingsDto,
  ): Promise<WorkerSettings> {
    if (request.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can update worker settings.');
    }

    const settings = await this.workerSettingsService.updateSettings(dto);

    await this.auditLogsService.record({
      actorId: request.user.sub,
      action: AuditAction.WORKER_SETTINGS_UPDATE,
      resourceType: AuditResourceType.WORKER_SETTINGS,
      resourceId: settings.id,
      summary: 'Worker settings updated.',
      after: {
        ocrLanguage: settings.ocrLanguage,
        ocrDpi: settings.ocrDpi,
        ocrPsm: settings.ocrPsm,
        ocrPdfOutputEnabled: settings.ocrPdfOutputEnabled,
      },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return settings;
  }
}
