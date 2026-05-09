import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkerSettingsService } from '../worker-settings.service';

describe('WorkerSettingsService', () => {
  it('uses env defaults when creating settings', async () => {
    const upsert = jest.fn().mockResolvedValue(createSettings());
    const prismaService = {
      workerSettings: {
        upsert,
      },
    } as unknown as PrismaService;
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string | number | boolean> = {
          'pdfProcessing.ocr.language': 'kor',
          'pdfProcessing.ocr.dpi': 300,
          'pdfProcessing.ocr.psm': 6,
          'pdfProcessing.ocr.pdfOutputEnabled': true,
        };

        return values[key];
      }),
    } as unknown as ConfigService;
    const service = new WorkerSettingsService(configService, prismaService);

    await service.getSettings();

    expect(upsert).toHaveBeenCalledWith({
      where: { id: 'global' },
      create: {
        id: 'global',
        ocrLanguage: 'kor',
        ocrDpi: 300,
        ocrPsm: 6,
        ocrPdfOutputEnabled: true,
      },
      update: {},
    });
  });

  it('maps persisted settings to OCR job options', async () => {
    const prismaService = {
      workerSettings: {
        upsert: jest.fn().mockResolvedValue(
          createSettings({
            ocrLanguage: 'kor',
            ocrDpi: 300,
            ocrPsm: 6,
            ocrPdfOutputEnabled: false,
          }),
        ),
      },
    } as unknown as PrismaService;
    const service = new WorkerSettingsService(
      createConfigService(),
      prismaService,
    );

    await expect(service.getOcrOptions()).resolves.toEqual({
      language: 'kor',
      dpi: 300,
      psm: 6,
      pdfOutputEnabled: false,
    });
  });
});

function createConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string | number | boolean> = {
        'pdfProcessing.ocr.language': 'eng',
        'pdfProcessing.ocr.dpi': 300,
        'pdfProcessing.ocr.psm': 6,
        'pdfProcessing.ocr.pdfOutputEnabled': true,
      };

      return values[key];
    }),
  } as unknown as ConfigService;
}

function createSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: 'global',
    ocrLanguage: 'eng',
    ocrDpi: 300,
    ocrPsm: 6,
    ocrPdfOutputEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
