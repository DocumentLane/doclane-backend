import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignedUrlOptions } from './interfaces/presigned-url-options.interface';

@Injectable()
export class S3Service {
  private readonly client: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.client = new S3Client(this.createClientConfig());
  }

  createGetObjectSignedUrl(options: PresignedUrlOptions): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.getBucket(),
        Key: options.key,
      }),
      { expiresIn: options.expiresInSeconds ?? 300 },
    );
  }

  createPutObjectSignedUrl(options: PresignedUrlOptions): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.getBucket(),
        Key: options.key,
        ContentType: options.contentType,
      }),
      { expiresIn: options.expiresInSeconds ?? 300 },
    );
  }

  private createClientConfig(): S3ClientConfig {
    const accessKeyId = this.configService.get<string>('s3.accessKeyId');
    const secretAccessKey =
      this.configService.get<string>('s3.secretAccessKey');

    return {
      region: this.configService.getOrThrow<string>('s3.region'),
      endpoint: this.configService.get<string>('s3.endpoint'),
      forcePathStyle:
        this.configService.getOrThrow<boolean>('s3.forcePathStyle'),
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    };
  }

  private getBucket(): string {
    return this.configService.getOrThrow<string>('s3.bucket');
  }
}
