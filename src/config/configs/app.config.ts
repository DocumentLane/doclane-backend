import { registerAs } from '@nestjs/config';

type TrustProxyConfig = boolean | number | string;

function parseTrustProxy(value: string | undefined): TrustProxyConfig {
  if (!value || value === 'false') {
    return false;
  }

  if (value === 'true') {
    return true;
  }

  const numericValue = Number(value);
  if (Number.isInteger(numericValue) && numericValue >= 0) {
    return numericValue;
  }

  return value;
}

export const appConfig = registerAs('app', () => ({
  port: Number(process.env.PORT ?? 3000),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
}));
