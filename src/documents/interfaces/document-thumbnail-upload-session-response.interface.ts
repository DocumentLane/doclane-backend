export interface DocumentThumbnailUploadSessionResponse {
  documentId: string;
  uploadUrl: string;
  method: 'PUT';
  storageBucket: string;
  objectKey: string;
  contentType: string;
  expiresAt: Date;
}
