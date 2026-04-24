import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

// ROLES_KEY — metadata key used to store required roles on route
export const ROLES_KEY = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {
  // Reflector reads metadata set by decorators
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Step 1: Read required roles from the route decorator
    // e.g. @Roles(Role.ADMIN) sets requiredRoles = ['ADMIN']
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Step 2: If no @Roles() decorator on this route
    // it means any authenticated user can access it
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Step 3: Get the user from request
    // WHY: JwtAuthGuard already ran before this guard
    //   so req.user is already populated with JWT payload
    const { user } = context.switchToHttp().getRequest();

    // Step 4: Safety check — if no user somehow
    if (!user) {
      throw new ForbiddenException('Access denied. Please login first.');
    }

    // Step 5: SUPER_ADMIN bypasses ALL role checks
    // WHY: Your friend (owner) must be able to do everything
    if (user.role === Role.SUPER_ADMIN) {
      return true;
    }

    // Step 6: Check if user's role is in the required roles list
    const hasRole = requiredRoles.includes(user.role);

    // Step 7: If role doesn't match — throw clear error message
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required role: ${requiredRoles.join(' or ')}. Your role: ${user.role}`,
      );
    }

    return true;
  }
}
