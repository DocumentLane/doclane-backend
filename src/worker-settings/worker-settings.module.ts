import { Module } from '@nestjs/common';
import { WorkerSettingsController } from './worker-settings.controller';
import { WorkerSettingsService } from './worker-settings.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [WorkerSettingsController],
  providers: [WorkerSettingsService],
  exports: [WorkerSettingsService],
})
export class WorkerSettingsModule {}
