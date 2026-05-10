import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { appConfig } from './config/configs/app.config';
import { authConfig } from './config/configs/auth.config';
import { databaseConfig } from './config/configs/database.config';
import { pdfProcessingConfig } from './config/configs/pdf-processing.config';
import { redisConfig } from './config/configs/redis.config';
import { s3Config } from './config/configs/s3.config';
import { environmentValidationSchema } from './config/schemas/env.validation-schema';
import { DocumentsModule } from './documents/documents.module';
import { FoldersModule } from './folders/folders.module';
import { GroupsModule } from './groups/groups.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { S3Module } from './s3/s3.module';
import { UsersModule } from './users/users.module';
import { WorkerSettingsModule } from './worker-settings/worker-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        pdfProcessingConfig,
        redisConfig,
        s3Config,
      ],
      validationSchema: environmentValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow<string>('redis.host'),
          port: configService.getOrThrow<number>('redis.port'),
          username: configService.get<string>('redis.username'),
          password: configService.get<string>('redis.password'),
          db: configService.getOrThrow<number>('redis.db'),
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    S3Module,
    AuthModule,
    WorkerSettingsModule,
    DocumentsModule,
    FoldersModule,
    UsersModule,
    GroupsModule,
  ],
})
export class AppModule {}
