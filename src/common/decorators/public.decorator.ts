import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../guards/jwt-auth.guard';

// SetMetadata stores a flag on the route handler
// JwtAuthGuard reads this flag and skips verification if true
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
