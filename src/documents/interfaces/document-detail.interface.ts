import { Document, DocumentPage } from '@prisma/client';

export interface DocumentDetail extends Document {
  pages?: DocumentPage[];
}
