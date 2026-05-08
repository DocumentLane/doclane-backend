export interface OidcProfileClaims {
  iss: string;
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}
