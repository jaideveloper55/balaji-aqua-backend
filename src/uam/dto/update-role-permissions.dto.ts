import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { MenuKey } from '@prisma/client';

class MenuToggleDto {
  @ApiProperty({ enum: MenuKey })
  @IsEnum(MenuKey)
  menuKey: MenuKey;

  @ApiProperty()
  @IsBoolean()
  isEnabled: boolean;
}

export class UpdateRolePermissionsDto {
  @ApiProperty({ type: [MenuToggleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuToggleDto)
  items: MenuToggleDto[];
}
