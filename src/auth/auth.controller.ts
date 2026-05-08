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
import { User } from '@prisma/client';
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
  constructor(private readonly authService: AuthService) {}

  @Get('authorize')
  @SerializeOptions({ type: OidcAuthorizationResponseDto })
  createAuthorizationUrl(): Promise<{ authorizationUrl: string }> {
    return this.authService.createAuthorizationUrl();
  }

  @Get('callback')
  @SerializeOptions({ type: AuthTokenResponseDto })
  authorizeCallback(
    @Query() query: OidcCallbackQueryDto,
  ): Promise<AuthTokenResponse> {
    return this.authService.authorizeCallback(query.code, query.state);
  }

  @Post('refresh')
  @SerializeOptions({ type: AuthTokenResponseDto })
  refreshToken(@Body() dto: RefreshTokenDto): Promise<AuthTokenResponse> {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @SerializeOptions({ type: AuthenticatedUserResponseDto })
  getMe(@Req() request: AuthenticatedRequest): Promise<User> {
    return this.authService.getAuthenticatedUser(request.user.sub);
  }
}
