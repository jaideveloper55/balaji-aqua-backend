import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

// IS_PUBLIC_KEY — used to mark routes as public (no auth needed)
// Example: POST /auth/login should be public, anyone can call it
export const IS_PUBLIC_KEY = 'isPublic';
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // WHY CHECK isPublic:
    //   Some routes must be accessible without a token.
    //   Example: /auth/login, /auth/register
    //   We mark them with @Public() decorator and skip auth check.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If route is marked @Public() — skip JWT verification
    if (isPublic) {
      return true;
    }

    // Otherwise run the standard JWT verification from passport
    return super.canActivate(context);
  }

  // WHY OVERRIDE handleRequest:
  //   Default error message is generic. We provide a clearer message.
  //   Also gives us a hook to add custom logic (logging, etc.)
  handleRequest(err: any, user: any, info: any) {
    // info contains the reason token failed
    // e.g. "TokenExpiredError", "JsonWebTokenError"
    if (err || !user) {
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException(
          'Your session has expired. Please login again.',
        );
      }
      throw new UnauthorizedException(
        'Invalid token. Please login to continue.',
      );
    }
    return user;
  }
}
