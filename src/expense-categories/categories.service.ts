import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ──────────────────────────────────────────────────────────────
  async create(companyId: string, dto: CreateCategoryDto) {
    const exists = await this.prisma.expenseCategory.findFirst({
      where: { companyId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (exists) {
      throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    return this.prisma.expenseCategory.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description ?? null,
        color: dto.color ?? '#64748b',
        bg: dto.bg ?? '#f1f5f9',
        icon: dto.icon ?? 'folder',
        monthlyBudget: new Prisma.Decimal(dto.monthlyBudget ?? 0),
        alertThreshold: dto.alertThreshold ?? 90,
        rolloverRule: dto.rolloverRule ?? 'NONE',
      },
    });
  }

  // ─── List (with this-month spend + budget usage) ──────────────────────────
  async findAll(companyId: string, query: QueryCategoryDto) {
    const where: Prisma.ExpenseCategoryWhereInput = { companyId };
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    if (query.activeOnly === 'true') {
      where.isActive = true;
    }

    const categories = await this.prisma.expenseCategory.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    // Compute this-month spend + transaction count per category
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const spendByCategory = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where: {
        companyId,
        date: { gte: monthStart },
        categoryId: { not: null },
      },
      _sum: { amount: true },
      _count: true,
      orderBy: { categoryId: 'asc' },
    });

    const spendMap = new Map(
      spendByCategory.map((s) => [
        s.categoryId,
        { spent: Number(s._sum?.amount ?? 0), transactions: s._count },
      ]),
    );

    return categories.map((c) => {
      const stat = spendMap.get(c.id) ?? { spent: 0, transactions: 0 };
      const monthlyBudget = Number(c.monthlyBudget);

      // WHY these field names:
      // Frontend Categoriespanel.tsx reads: spentThisMonth, monthlyBudget,
      // percentUsed, budgetRemaining, transactions
      // The old service returned: spent, budget, usedPercent, remaining
      // which caused all cards to show ₹0 and 0%
      return {
        ...c,
        monthlyBudget, // was: budget
        spentThisMonth: stat.spent, // was: spent
        transactions: stat.transactions,
        percentUsed:
          monthlyBudget > 0
            ? Math.round((stat.spent / monthlyBudget) * 100)
            : 0, // was: usedPercent
        budgetRemaining: Math.max(0, monthlyBudget - stat.spent), // was: remaining
        isOverBudget: monthlyBudget > 0 && stat.spent > monthlyBudget,

        // Keep old names too for any other consumers
        spent: stat.spent,
        budget: monthlyBudget,
        usedPercent:
          monthlyBudget > 0
            ? Math.round((stat.spent / monthlyBudget) * 100)
            : 0,
        remaining: Math.max(0, monthlyBudget - stat.spent),
      };
    });
  }

  // ─── Monthly budget overview (for Categories tab header + Budget Alerts) ──
  async getBudgetOverview(companyId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [budgetAgg, spendAgg] = await this.prisma.$transaction([
      this.prisma.expenseCategory.aggregate({
        where: { companyId, isActive: true },
        _sum: { monthlyBudget: true },
      }),
      this.prisma.expense.aggregate({
        where: { companyId, date: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    const totalBudget = Number(budgetAgg._sum.monthlyBudget ?? 0);
    const totalSpent = Number(spendAgg._sum.amount ?? 0);

    const categories = await this.findAll(companyId, {});

    return {
      totalSpent,
      totalBudget,
      utilizedPercent:
        totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,

      overBudgetCount: categories.filter((c) => c.isOverBudget).length,

      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        bg: c.bg,
        monthlyBudget: c.monthlyBudget,
        spentThisMonth: c.spentThisMonth,
        percentUsed: c.percentUsed,
        budgetRemaining: c.budgetRemaining,
        transactions: c.transactions,
      })),
    };
  }

  // ─── Simple list (for dropdowns) ─────────────────────────────────────────
  async listSimple(companyId: string) {
    return this.prisma.expenseCategory.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, color: true, bg: true, icon: true },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Find one ────────────────────────────────────────────────────────────
  async findOne(companyId: string, id: string) {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id, companyId },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  // ─── Update ──────────────────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateCategoryDto) {
    await this.findOne(companyId, id);

    if (dto.name) {
      const clash = await this.prisma.expenseCategory.findFirst({
        where: {
          companyId,
          name: { equals: dto.name, mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (clash)
        throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    const data: Prisma.ExpenseCategoryUpdateInput = { ...dto } as any;
    if (dto.monthlyBudget !== undefined) {
      data.monthlyBudget = new Prisma.Decimal(dto.monthlyBudget);
    }

    return this.prisma.expenseCategory.update({ where: { id }, data });
  }

  async remove(companyId: string, id: string) {
    const category = await this.findOne(companyId, id);

    const linkedCount = await this.prisma.expense.count({
      where: { companyId, categoryId: id },
    });
    if (linkedCount > 0) {
      throw new BadRequestException(
        `Cannot delete — ${linkedCount} expense(s) are linked to this category. Reassign them first.`,
      );
    }

    await this.prisma.expenseCategory.delete({ where: { id } });
    return { message: 'Category deleted successfully' };
  }
}
