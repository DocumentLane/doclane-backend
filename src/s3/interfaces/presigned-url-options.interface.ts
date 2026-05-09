export interface PresignedUrlOptions {
  key: string;
  expiresInSeconds?: number;
  contentType?: string;
  responseContentDisposition?: string;
  responseContentType?: string;
}
