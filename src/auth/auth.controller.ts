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
import { RegisterDto } from './dto/register.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── POST /auth/register ──────────────────────────────────────────────────
  // Public — creates company + admin user in one call
  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new company + admin user' })
  @ApiResponse({ status: 201, description: 'Registered. Returns JWT tokens.' })
  @ApiResponse({ status: 409, description: 'Email or GST already exists.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── POST /auth/login ─────────────────────────────────────────────────────
  // Public — returns accessToken (15m) + refreshToken (7d)
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — returns access + refresh tokens' })
  @ApiResponse({ status: 200, description: 'Login successful.' })
  @ApiResponse({ status: 401, description: 'Invalid email or password.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ─── POST /auth/refresh ───────────────────────────────────────────────────
  // Send refreshToken as Bearer → get new accessToken
  // React calls this automatically when it gets a 401 response
  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get new accessToken using refreshToken' })
  @ApiResponse({ status: 200, description: 'New accessToken issued.' })
  @ApiResponse({
    status: 401,
    description: 'Refresh token expired — login again.',
  })
  refresh(@CurrentUser() user: JwtPayload) {
    return this.authService.refresh(user.sub, user);
  }

  // ─── POST /auth/logout ────────────────────────────────────────────────────
  // Deletes refreshToken from DB — forces re-login
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout — invalidates refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out.' })
  logout(@CurrentUser() user: JwtPayload) {
    return this.authService.logout(user.sub);
  }

  // ─── GET /auth/me ─────────────────────────────────────────────────────────
  // Returns fresh profile from DB — call on React app startup
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }
}
