import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuthModule } from '../auth/auth.module';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';

@Module({
  imports: [AccessControlModule, AuthModule],
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}
