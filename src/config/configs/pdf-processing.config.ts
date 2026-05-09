import { registerAs } from '@nestjs/config';

export const pdfProcessingConfig = registerAs('pdfProcessing', () => ({
  ocr: {
    language: process.env.PDF_OCR_LANGUAGE ?? 'eng',
    dpi: Number(process.env.PDF_OCR_DPI ?? 300),
    psm: Number(process.env.PDF_OCR_PSM ?? 6),
    pdfOutputEnabled: process.env.PDF_OCR_PDF_OUTPUT_ENABLED !== 'false',
  },
}));
