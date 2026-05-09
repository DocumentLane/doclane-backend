export interface DocumentPreviewResponse {
  documentId: string;
  previewUrl: string;
  contentType: string;
  width: number | null;
  height: number | null;
  expiresIn: number;
}
