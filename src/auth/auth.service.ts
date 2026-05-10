import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User, UserRole } from '@prisma/client';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  Configuration,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokenPair } from './interfaces/auth-token-pair.interface';
import { AuthTokenResponse } from './interfaces/auth-token-response.interface';
import { JwtAuthPayload } from './interfaces/jwt-auth-payload.interface';
import { OidcProfile } from './interfaces/oidc-profile.interface';
import { OidcProfileClaims } from './interfaces/oidc-profile-claims.interface';

@Injectable()
export class AuthService {
  private oidcConfiguration?: Configuration;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
  ) {}

  async createAuthorizationUrl(): Promise<{ authorizationUrl: string }> {
    const config = await this.getOidcConfiguration();
    const redirectUri = this.configService.getOrThrow<string>(
      'auth.oidc.redirectUri',
    );
    const state = randomState();
    const nonce = randomNonce();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

    await this.prismaService.oidcAuthorizationState.create({
      data: {
        state,
        nonce,
        codeVerifier,
        redirectUri,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const authorizationUrl = buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: this.configService.getOrThrow<string>('auth.oidc.scopes'),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    return { authorizationUrl: authorizationUrl.toString() };
  }

  async authorizeCallback(
    code: string,
    state: string,
  ): Promise<AuthTokenResponse> {
    const pendingState =
      await this.prismaService.oidcAuthorizationState.findUnique({
        where: { state },
      });

    if (!pendingState || pendingState.expiresAt < new Date()) {
      throw new BadRequestException(
        'OIDC authorization state is invalid or expired.',
      );
    }

    const config = await this.getOidcConfiguration();
    const callbackUrl = new URL(pendingState.redirectUri);
    callbackUrl.searchParams.set('code', code);
    callbackUrl.searchParams.set('state', state);

    const tokenResponse = await authorizationCodeGrant(config, callbackUrl, {
      expectedNonce: pendingState.nonce,
      expectedState: state,
      pkceCodeVerifier: pendingState.codeVerifier,
    });
    const claims = tokenResponse.claims();

    if (!claims) {
      throw new BadRequestException(
        'OIDC provider did not return an id_token.',
      );
    }

    const profileClaims = claims as OidcProfileClaims;
    const user = await this.upsertAuthorizedUser({
      issuer: profileClaims.iss,
      subject: profileClaims.sub,
      email: profileClaims.email,
      displayName: profileClaims.name ?? profileClaims.preferred_username,
      groupExternalIds: this.extractGroupExternalIds(profileClaims),
    });

    await this.prismaService.oidcAuthorizationState.delete({
      where: { state },
    });

    return {
      ...(await this.createTokenPair(user)),
      user,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenResponse> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.prismaService.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('Refresh token user no longer exists.');
    }

    return {
      ...(await this.createTokenPair(user)),
      user,
    };
  }

  async getAuthenticatedUser(userId: string): Promise<User> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Authenticated user no longer exists.');
    }

    return user;
  }

  async verifyAccessToken(accessToken: string): Promise<JwtAuthPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtAuthPayload>(accessToken, {
        secret: this.configService.getOrThrow<string>('auth.jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Bearer token is invalid or expired.');
    }
  }

  private async getOidcConfiguration(): Promise<Configuration> {
    if (this.oidcConfiguration) {
      return this.oidcConfiguration;
    }

    this.oidcConfiguration = await discovery(
      new URL(this.configService.getOrThrow<string>('auth.oidc.issuerUrl')),
      this.configService.getOrThrow<string>('auth.oidc.clientId'),
      this.configService.getOrThrow<string>('auth.oidc.clientSecret'),
    );

    return this.oidcConfiguration;
  }

  private async upsertAuthorizedUser(profile: OidcProfile) {
    return this.prismaService.$transaction(
      async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: {
            oidcIssuer_oidcSubject: {
              oidcIssuer: profile.issuer,
              oidcSubject: profile.subject,
            },
          },
        });

        if (existingUser) {
          const updatedUser = await tx.user.update({
            where: { id: existingUser.id },
            data: {
              email: profile.email,
              displayName: profile.displayName,
              authorizedAt: new Date(),
            },
          });

          if (!updatedUser.groupsInitializedAt) {
            return this.initializeUserGroups(tx, updatedUser, profile);
          }

          return updatedUser;
        }

        const userCount = await tx.user.count();

        const createdUser = await tx.user.create({
          data: {
            oidcIssuer: profile.issuer,
            oidcSubject: profile.subject,
            email: profile.email,
            displayName: profile.displayName,
            role: userCount === 0 ? UserRole.ADMIN : UserRole.USER,
          },
        });

        return this.initializeUserGroups(tx, createdUser, profile);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async initializeUserGroups(
    tx: Prisma.TransactionClient,
    user: User,
    profile: OidcProfile,
  ): Promise<User> {
    const groupIds: string[] = [];

    for (const externalId of profile.groupExternalIds) {
      const group = await tx.oidcGroup.upsert({
        where: {
          issuer_externalId: {
            issuer: profile.issuer,
            externalId,
          },
        },
        create: {
          issuer: profile.issuer,
          externalId,
          displayName: externalId,
        },
        update: {},
      });
      groupIds.push(group.id);
    }

    if (groupIds.length > 0) {
      await tx.userGroupMembership.createMany({
        data: groupIds.map((groupId) => ({
          userId: user.id,
          groupId,
        })),
        skipDuplicates: true,
      });
    }

    return tx.user.update({
      where: { id: user.id },
      data: { groupsInitializedAt: new Date() },
    });
  }

  private extractGroupExternalIds(claims: OidcProfileClaims): string[] {
    const groupsClaim = this.configService.get<string>(
      'auth.oidc.groupsClaim',
      'groups',
    );
    const rawGroups = claims[groupsClaim];

    if (!Array.isArray(rawGroups)) {
      return [];
    }

    const groupExternalIds = rawGroups.filter(
      (group): group is string => typeof group === 'string',
    );

    return [...new Set(groupExternalIds.map((group) => group.trim()))].filter(
      (group) => group.length > 0,
    );
  }

  private async createTokenPair(user: User): Promise<AuthTokenPair> {
    const payload: JwtAuthPayload = {
      sub: user.id,
      role: user.role,
    };
    const accessTokenExpiresIn = this.configService.getOrThrow<number>(
      'auth.jwt.accessTokenExpiresInSeconds',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('auth.jwt.accessSecret'),
        expiresIn: accessTokenExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('auth.jwt.refreshSecret'),
        expiresIn: this.configService.getOrThrow<number>(
          'auth.jwt.refreshTokenExpiresInSeconds',
        ),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTokenExpiresIn,
    };
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<JwtAuthPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtAuthPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('auth.jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }
  }
}
