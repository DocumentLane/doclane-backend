import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { S3Module } from '../s3/s3.module';
import { WorkerSettingsModule } from '../worker-settings/worker-settings.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PdfMetadataResultProcessor } from './pdf-metadata-result.processor';
import { PdfOcrResultProcessor } from './pdf-ocr-result.processor';

@Module({
  imports: [
    AuthModule,
    S3Module,
    WorkerSettingsModule,
    BullModule.registerQueue({
      name: 'pdf-metadata',
    }),
    BullModule.registerQueue({
      name: 'pdf-metadata-result',
    }),
    BullModule.registerQueue({
      name: 'pdf-ocr',
    }),
    BullModule.registerQueue({
      name: 'pdf-ocr-result',
    }),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    PdfMetadataResultProcessor,
    PdfOcrResultProcessor,
  ],
})
export class DocumentsModule {}
