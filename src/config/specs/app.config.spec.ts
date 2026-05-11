import { appConfig } from '../configs/app.config';

describe('appConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.TRUST_PROXY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults trust proxy to false', () => {
    expect(appConfig()).toMatchObject({
      trustProxy: false,
    });
  });

  it('parses boolean trust proxy values', () => {
    process.env.TRUST_PROXY = 'true';
    expect(appConfig()).toMatchObject({
      trustProxy: true,
    });

    process.env.TRUST_PROXY = 'false';
    expect(appConfig()).toMatchObject({
      trustProxy: false,
    });
  });

  it('parses numeric trust proxy values', () => {
    process.env.TRUST_PROXY = '1';

    expect(appConfig()).toMatchObject({
      trustProxy: 1,
    });
  });

  it('keeps named trust proxy values as strings', () => {
    process.env.TRUST_PROXY = 'loopback';

    expect(appConfig()).toMatchObject({
      trustProxy: 'loopback',
    });
  });
});
