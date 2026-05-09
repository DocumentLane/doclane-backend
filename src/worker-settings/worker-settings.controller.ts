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
import { UserRole, WorkerSettings } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { UpdateWorkerSettingsDto } from './dto/update-worker-settings.dto';
import { WorkerSettingsResponseDto } from './dto/worker-settings-response.dto';
import { WorkerSettingsService } from './worker-settings.service';

@Controller('worker-settings')
@UseGuards(JwtAuthGuard)
@SerializeOptions({ strategy: 'excludeAll', type: WorkerSettingsResponseDto })
export class WorkerSettingsController {
  constructor(private readonly workerSettingsService: WorkerSettingsService) {}

  @Get()
  getSettings(): Promise<WorkerSettings> {
    return this.workerSettingsService.getSettings();
  }

  @Patch()
  updateSettings(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateWorkerSettingsDto,
  ): Promise<WorkerSettings> {
    if (request.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can update worker settings.');
    }

    return this.workerSettingsService.updateSettings(dto);
  }
}
