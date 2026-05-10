import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkerSettingsController } from './worker-settings.controller';
import { WorkerSettingsService } from './worker-settings.service';

@Module({
  imports: [AuthModule],
  controllers: [WorkerSettingsController],
  providers: [WorkerSettingsService],
  exports: [WorkerSettingsService],
})
export class WorkerSettingsModule {}
