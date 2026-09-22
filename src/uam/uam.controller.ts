import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseEnumPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UamService } from './uam.service';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

@ApiTags('UAM - Role Menu Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('uam')
export class UamController {
  constructor(private readonly uamService: UamService) {}

  @Get('role-permissions/:role')
  @ApiOperation({ summary: 'Get menu toggle state for a role' })
  getRolePermissions(@Param('role', new ParseEnumPipe(Role)) role: Role) {
    return this.uamService.getRolePermissions(role);
  }

  @Patch('role-permissions/:role')
  @ApiOperation({ summary: 'Save menu toggles for a role' })
  updateRolePermissions(
    @Param('role', new ParseEnumPipe(Role)) role: Role,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.uamService.updateRolePermissions(role, dto);
  }
}
