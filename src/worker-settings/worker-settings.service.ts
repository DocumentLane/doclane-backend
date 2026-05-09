import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WorkerSettings } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateWorkerSettingsDto } from './dto/update-worker-settings.dto';
import { WorkerOcrOptions } from './interfaces/worker-ocr-options.interface';

@Injectable()
export class WorkerSettingsService {
  private readonly settingsId = 'global';

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  getSettings(): Promise<WorkerSettings> {
    return this.prismaService.workerSettings.upsert({
      where: { id: this.settingsId },
      create: this.createDefaultSettingsData(),
      update: {},
    });
  }

  updateSettings(dto: UpdateWorkerSettingsDto): Promise<WorkerSettings> {
    const update = this.createUpdateData(dto);

    return this.prismaService.workerSettings.upsert({
      where: { id: this.settingsId },
      create: {
        ...this.createDefaultSettingsData(),
        ...this.createCreateOverrides(dto),
      },
      update,
    });
  }

  async getOcrOptions(): Promise<WorkerOcrOptions> {
    const settings = await this.getSettings();

    return {
      language: settings.ocrLanguage,
      dpi: settings.ocrDpi,
      psm: settings.ocrPsm,
      pdfOutputEnabled: settings.ocrPdfOutputEnabled,
    };
  }

  private createDefaultSettingsData(): Prisma.WorkerSettingsCreateInput {
    return {
      id: this.settingsId,
      ocrLanguage: this.configService.getOrThrow<string>(
        'pdfProcessing.ocr.language',
      ),
      ocrDpi: this.configService.getOrThrow<number>('pdfProcessing.ocr.dpi'),
      ocrPsm: this.configService.getOrThrow<number>('pdfProcessing.ocr.psm'),
      ocrPdfOutputEnabled: this.configService.getOrThrow<boolean>(
        'pdfProcessing.ocr.pdfOutputEnabled',
      ),
    };
  }

  private createUpdateData(
    dto: UpdateWorkerSettingsDto,
  ): Prisma.WorkerSettingsUpdateInput {
    return {
      ...(dto.ocrLanguage !== undefined
        ? { ocrLanguage: dto.ocrLanguage }
        : {}),
      ...(dto.ocrDpi !== undefined ? { ocrDpi: dto.ocrDpi } : {}),
      ...(dto.ocrPsm !== undefined ? { ocrPsm: dto.ocrPsm } : {}),
      ...(dto.ocrPdfOutputEnabled !== undefined
        ? { ocrPdfOutputEnabled: dto.ocrPdfOutputEnabled }
        : {}),
    };
  }

  private createCreateOverrides(
    dto: UpdateWorkerSettingsDto,
  ): Partial<Prisma.WorkerSettingsCreateInput> {
    return {
      ...(dto.ocrLanguage !== undefined
        ? { ocrLanguage: dto.ocrLanguage }
        : {}),
      ...(dto.ocrDpi !== undefined ? { ocrDpi: dto.ocrDpi } : {}),
      ...(dto.ocrPsm !== undefined ? { ocrPsm: dto.ocrPsm } : {}),
      ...(dto.ocrPdfOutputEnabled !== undefined
        ? { ocrPdfOutputEnabled: dto.ocrPdfOutputEnabled }
        : {}),
    };
  }
}
