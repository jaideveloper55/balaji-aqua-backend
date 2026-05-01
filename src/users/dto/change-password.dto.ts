import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangePasswordDto {
  // OPTIONAL: required when user is changing their OWN password.
  // SUPER_ADMIN resetting someone else's password skips this check (admin reset).
  // Service layer enforces: if currentUser.id === target.id then this MUST be present.
  @ApiPropertyOptional({
    example: 'OldPass@123',
    description:
      'Required when changing your own password. Omit when SUPER_ADMIN ' +
      'resets another user (admin reset for forgotten passwords).',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiProperty({ example: 'NewPass@456' })
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'New password must have uppercase, lowercase and number',
  })
  newPassword: string;
}
