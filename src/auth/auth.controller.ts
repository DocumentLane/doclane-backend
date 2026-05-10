import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import { AuditAction, AuditResourceType, User } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthService } from './auth.service';
import { AuthenticatedUserResponseDto } from './dto/authenticated-user-response.dto';
import { AuthTokenResponseDto } from './dto/auth-token-response.dto';
import { OidcCallbackQueryDto } from './dto/oidc-callback-query.dto';
import { OidcAuthorizationResponseDto } from './dto/oidc-authorization-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthTokenResponse } from './interfaces/auth-token-response.interface';
import type { AuthenticatedRequest } from './interfaces/authenticated-request.interface';

@Controller('auth/oidc')
@SerializeOptions({ strategy: 'excludeAll' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get('authorize')
  @SerializeOptions({ type: OidcAuthorizationResponseDto })
  createAuthorizationUrl(): Promise<{ authorizationUrl: string }> {
    return this.authService.createAuthorizationUrl();
  }

  @Get('callback')
  @SerializeOptions({ type: AuthTokenResponseDto })
  async authorizeCallback(
    @Req() request: AuthenticatedRequest,
    @Query() query: OidcCallbackQueryDto,
  ): Promise<AuthTokenResponse> {
    const response = await this.authService.authorizeCallback(
      query.code,
      query.state,
    );

    await this.auditLogsService.record({
      actorId: response.user.id,
      action: AuditAction.AUTH_LOGIN,
      resourceType: AuditResourceType.AUTH,
      resourceId: response.user.id,
      summary: 'OIDC login succeeded.',
      after: {
        userId: response.user.id,
        role: response.user.role,
      },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return response;
  }

  @Post('refresh')
  @SerializeOptions({ type: AuthTokenResponseDto })
  async refreshToken(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RefreshTokenDto,
  ): Promise<AuthTokenResponse> {
    const response = await this.authService.refreshToken(dto.refreshToken);

    await this.auditLogsService.record({
      actorId: response.user.id,
      action: AuditAction.AUTH_REFRESH,
      resourceType: AuditResourceType.AUTH,
      resourceId: response.user.id,
      summary: 'Refresh token succeeded.',
      after: {
        userId: response.user.id,
        role: response.user.role,
      },
      ...this.auditLogsService.createRequestMetadata(request),
    });

    return response;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @SerializeOptions({ type: AuthenticatedUserResponseDto })
  getMe(@Req() request: AuthenticatedRequest): Promise<User> {
    return this.authService.getAuthenticatedUser(request.user.sub);
  }
}
