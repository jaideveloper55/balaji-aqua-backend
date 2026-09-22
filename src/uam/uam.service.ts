import { Injectable, BadRequestException } from '@nestjs/common';
import { Role, MenuKey } from '@prisma/client';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { PrismaService } from 'src/prisma/prisma.service';

// User CRUD (list/create/role/status) has moved to UsersService — that
// module was already a mature, working system (role-scoped creation,
// multi-company support via UserCompany, self-protection guards) built
// before UAM existed. This service now only owns what's genuinely new:
// the Role → Menu permission toggles, which live nowhere else.
@Injectable()
export class UamService {
  constructor(private prisma: PrismaService) {}

  private readonly ALL_MENU_KEYS = Object.values(MenuKey);

  // ─────────────────────────────────────────────────────────
  // MENU ACCESS — the toggle panel in "Change User Role"
  // ─────────────────────────────────────────────────────────
  async getRolePermissions(role: Role) {
    if (role === Role.SUPER_ADMIN) {
      throw new BadRequestException(
        'Super Admin always has full access — nothing to configure',
      );
    }
    const saved = await this.prisma.roleMenuPermission.findMany({
      where: { role },
    });
    const savedMap = new Map(saved.map((row) => [row.menuKey, row.isEnabled]));
    return this.ALL_MENU_KEYS.map((menuKey) => ({
      menuKey,
      isEnabled: savedMap.get(menuKey) ?? false,
    }));
  }

  async updateRolePermissions(role: Role, dto: UpdateRolePermissionsDto) {
    if (role === Role.SUPER_ADMIN) {
      throw new BadRequestException('Super Admin permissions cannot be edited');
    }
    return this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.roleMenuPermission.upsert({
          where: { role_menuKey: { role, menuKey: item.menuKey } },
          update: { isEnabled: item.isEnabled },
          create: { role, menuKey: item.menuKey, isEnabled: item.isEnabled },
        }),
      ),
    );
  }
}
