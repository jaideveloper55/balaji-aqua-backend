import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── PUBLIC ────────────────────────────────────────────────────────────
  // @Public() tells the global JwtAuthGuard to skip auth check on this route

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email + password' })
  @ApiResponse({
    status: 200,
    description: 'Returns user, accessible companies, and tokens',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ─── REFRESH (semi-public) ─────────────────────────────────────────────
  // @Public() bypasses the global JwtAuthGuard (which expects access token).
  // Then JwtRefreshGuard takes over and validates the refresh token instead.

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a new access token using refresh token' })
  refresh(@CurrentUser() user: JwtPayload) {
    return this.authService.refresh(user.sub, user);
  }

  // ─── PROTECTED ─────────────────────────────────────────────────────────
  // No @Public() = global JwtAuthGuard validates access token automatically.
  // No need for explicit @UseGuards(JwtAuthGuard) — it runs globally.

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout — invalidates refresh token' })
  logout(@CurrentUser() user: JwtPayload) {
    return this.authService.logout(user.sub);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile + accessible companies' })
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }

  // ─── SUPER_ADMIN ONLY ──────────────────────────────────────────────────
  // Note: You also have UsersController with POST /users. Pick ONE.
  // Recommended: delete this and use UsersController.create() instead.

  @Post('users')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Super admin creates a user (admin/staff/delivery)',
  })
  createUser(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {
    return this.authService.createUser(user.sub, dto);
  }
}
