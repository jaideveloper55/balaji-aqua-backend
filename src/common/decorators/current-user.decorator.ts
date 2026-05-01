import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  companyIds: string[];
  firstName: string;
  lastName: string;
}

// createParamDecorator creates a custom parameter decorator
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    // Switch to HTTP context to get the request object
    const request = ctx.switchToHttp().getRequest();

    // req.user is populated by JwtStrategy.validate() after token verification
    const user: JwtPayload = request.user;

    return data ? user?.[data] : user;
  },
);
