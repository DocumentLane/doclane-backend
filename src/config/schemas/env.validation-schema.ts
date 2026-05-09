import Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  PORT: Joi.number().integer().min(1).default(3000),
  DATABASE_URL: Joi.string().uri().optional(),
  OIDC_ISSUER_URL: Joi.string().uri().optional(),
  OIDC_CLIENT_ID: Joi.string().optional(),
  OIDC_CLIENT_SECRET: Joi.string().optional(),
  OIDC_REDIRECT_URI: Joi.string().uri().optional(),
  OIDC_SCOPES: Joi.string().optional(),
  OIDC_POST_AUTH_REDIRECT_URL: Joi.string().uri().optional(),
  JWT_ACCESS_SECRET: Joi.string().min(32).optional(),
  JWT_REFRESH_SECRET: Joi.string().min(32).optional(),
  JWT_ACCESS_TOKEN_EXPIRES_IN_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(900),
  JWT_REFRESH_TOKEN_EXPIRES_IN_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(1209600),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().min(1).default(6379),
  REDIS_USERNAME: Joi.string().optional(),
  REDIS_PASSWORD: Joi.string().optional(),
  REDIS_DB: Joi.number().integer().min(0).default(0),
  S3_REGION: Joi.string().optional(),
  S3_BUCKET: Joi.string().optional(),
  S3_ACCESS_KEY_ID: Joi.string().optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().optional(),
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_FORCE_PATH_STYLE: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  PDF_OCR_LANGUAGE: Joi.string().default('eng'),
  PDF_OCR_DPI: Joi.number().integer().min(1).default(300),
  PDF_OCR_PSM: Joi.number().integer().min(0).max(13).default(6),
  PDF_OCR_PDF_OUTPUT_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
});
