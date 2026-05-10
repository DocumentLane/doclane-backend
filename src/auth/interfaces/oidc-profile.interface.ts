export interface OidcProfile {
  issuer: string;
  subject: string;
  email?: string;
  displayName?: string;
  groupExternalIds: string[];
}
