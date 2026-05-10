import { environmentValidationSchema } from '../schemas/env.validation-schema';

describe('environmentValidationSchema', () => {
  it('accepts the minimal local development configuration', () => {
    const result = environmentValidationSchema.validate({
      DATABASE_URL: 'postgresql://doclane:doclane@localhost:5432/doclane',
    });

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      PORT: 3000,
      OIDC_GROUPS_CLAIM: 'groups',
      PDF_OCR_LANGUAGE: 'eng',
      PDF_OCR_DPI: 300,
      PDF_OCR_PSM: 6,
      PDF_OCR_PDF_OUTPUT_ENABLED: true,
    });
  });

  it('rejects an invalid S3 endpoint', () => {
    const result = environmentValidationSchema.validate({
      S3_ENDPOINT: 'not-a-url',
    });

    expect(result.error).toBeDefined();
  });
});
