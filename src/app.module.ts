import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { appConfig } from './config/configs/app.config';
import { authConfig } from './config/configs/auth.config';
import { databaseConfig } from './config/configs/database.config';
import { s3Config } from './config/configs/s3.config';
import { environmentValidationSchema } from './config/schemas/env.validation-schema';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { S3Module } from './s3/s3.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig, s3Config],
      validationSchema: environmentValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    PrismaModule,
    RedisModule,
    S3Module,
    AuthModule,
  ],
})
export class AppModule {}
