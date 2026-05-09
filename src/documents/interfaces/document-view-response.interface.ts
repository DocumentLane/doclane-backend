import { DocumentLinearizationStatus } from '@prisma/client';

export interface DocumentViewResponse {
  documentId: string;
  viewUrl: string;
  expiresIn: number;
  isLinearized: boolean;
  linearizationStatus: DocumentLinearizationStatus;
}
