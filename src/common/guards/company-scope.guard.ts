import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';

@Injectable()
export class CompanyScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip the company check on @Public() routes (login, register, refresh).
    // These run BEFORE a user/company exists, so they can't be scoped.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user) throw new ForbiddenException('Authentication required');

    const companyId =
      request.headers['x-company-id'] || request.headers['X-Company-Id'];

    if (!companyId || typeof companyId !== 'string') {
      throw new BadRequestException(
        'Missing X-Company-Id header. Frontend must send the active company.',
      );
    }

    // SUPER_ADMIN can access any company
    if (user.role === Role.SUPER_ADMIN) {
      request.companyId = companyId;
      return true;
    }

    // Others: companyId must be in their JWT-issued list
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('You do not have access to this company');
    }

    request.companyId = companyId;
    return true;
  }
}
