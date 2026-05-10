import { registerAs } from '@nestjs/config';

export const authConfig = registerAs('auth', () => ({
  oidc: {
    issuerUrl: process.env.OIDC_ISSUER_URL,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    redirectUri: process.env.OIDC_REDIRECT_URI,
    scopes: process.env.OIDC_SCOPES ?? 'openid email profile',
    groupsClaim: process.env.OIDC_GROUPS_CLAIM ?? 'groups',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTokenExpiresInSeconds: Number(
      process.env.JWT_ACCESS_TOKEN_EXPIRES_IN_SECONDS ?? 900,
    ),
    refreshTokenExpiresInSeconds: Number(
      process.env.JWT_REFRESH_TOKEN_EXPIRES_IN_SECONDS ?? 1209600,
    ),
  },
}));
