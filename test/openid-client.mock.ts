export class Configuration {}

export function randomState() {
  return 'state';
}

export function randomNonce() {
  return 'nonce';
}

export function randomPKCECodeVerifier() {
  return 'code-verifier';
}

export function calculatePKCECodeChallenge() {
  return Promise.resolve('code-challenge');
}

export function buildAuthorizationUrl() {
  return new URL('https://issuer.example.com/authorize');
}

export function discovery() {
  return Promise.resolve(new Configuration());
}

export function authorizationCodeGrant() {
  return Promise.resolve({
    claims: () => undefined,
  });
}
