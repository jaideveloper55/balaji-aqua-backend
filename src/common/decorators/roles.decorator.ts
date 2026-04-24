import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../guards/roles.guard';

// SetMetadata stores the roles array on the route handler
// RolesGuard reads it using Reflector
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
