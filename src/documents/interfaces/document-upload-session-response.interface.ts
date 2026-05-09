export interface DocumentUploadSessionResponse {
  documentId: string;
  uploadUrl: string;
  method: 'PUT';
  storageBucket: string;
  objectKey: string;
  contentType: 'application/pdf';
  expiresAt: Date;
}
