import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
@SerializeOptions({ strategy: 'excludeAll', type: UserResponseDto })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers(@Req() request: AuthenticatedRequest): Promise<User[]> {
    this.assertAdmin(request);
    return this.usersService.listUsers();
  }

  @Get(':id')
  getUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) userId: string,
  ): Promise<User> {
    this.assertAdmin(request);
    return this.usersService.getUser(userId);
  }

  @Put(':id')
  updateUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    this.assertAdmin(request);
    return this.usersService.updateUser(userId, dto);
  }

  private assertAdmin(request: AuthenticatedRequest): void {
    if (request.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can manage users.');
    }
  }
}
