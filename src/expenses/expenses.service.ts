import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ExpenseStatus } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpenseDto } from './dto/query-expense.dto';

function calculateNextDueDate(currentDue: Date, frequency: string): Date {
  const next = new Date(currentDue);

  switch (frequency.toUpperCase()) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;

    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;

    case 'BIWEEKLY':
    case 'BI_WEEKLY':
      next.setDate(next.getDate() + 14);
      break;

    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;

    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      break;

    case 'YEARLY':
    case 'ANNUAL':
      next.setFullYear(next.getFullYear() + 1);
      break;

    default:
      console.warn(
        `calculateNextDueDate: unknown frequency "${frequency}", defaulting to MONTHLY`,
      );
      next.setMonth(next.getMonth() + 1);
      break;
  }

  return next;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateExpenseNo(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `EXP-${year}-`;

    const last = await this.prisma.expense.findFirst({
      where: { companyId, expenseNo: { startsWith: prefix } },
      orderBy: { expenseNo: 'desc' },
      select: { expenseNo: true },
    });

    let next = 1;
    if (last?.expenseNo) {
      const num = parseInt(last.expenseNo.replace(prefix, ''), 10);
      if (!isNaN(num)) next = num + 1;
    }
    return `${prefix}${String(next).padStart(3, '0')}`;
  }

  async create(companyId: string, userId: string, dto: CreateExpenseDto) {
    const expenseNo = await this.generateExpenseNo(companyId);

    return this.prisma.expense.create({
      data: {
        companyId,
        expenseNo,
        vendorName: dto.vendorName,
        vendorId: dto.vendorId ?? null,
        description: dto.description,
        categoryId: dto.categoryId ?? null,
        categoryName: dto.categoryName,
        amount: new Prisma.Decimal(dto.amount),
        gstAmount: new Prisma.Decimal(dto.gstAmount ?? 0),
        paymentMode: dto.paymentMode,
        status: dto.status ?? ExpenseStatus.PENDING,
        date: new Date(dto.date),
        notes: dto.notes ?? null,
        createdById: userId,
      },
    });
  }

  async findAll(companyId: string, query: QueryExpenseDto) {
    const {
      search,
      categoryId,
      category,
      status,
      paymentMode,
      dateFrom,
      dateTo,
      page = 1,
      limit = 10,
      sortBy = 'date',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.ExpenseWhereInput = { companyId };

    if (search) {
      where.OR = [
        { vendorName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { expenseNo: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (category) where.categoryName = category;
    if (status) where.status = status;
    if (paymentMode) where.paymentMode = paymentMode;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const allowedSort = ['date', 'amount', 'createdAt'];
    const orderBy: Prisma.ExpenseOrderByWithRelationInput = {
      [allowedSort.includes(sortBy) ? sortBy : 'date']: sortOrder,
    };

    const [data, total, aggregate] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalAmount: aggregate._sum.amount ?? new Prisma.Decimal(0),
      },
    };
  }

  // ─── Stats (for Overview cards) ──────────────────────────────────────────
  async getStats(companyId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    );

    const [thisMonth, lastMonth, pending, byCategory, byMode] =
      await this.prisma.$transaction([
        this.prisma.expense.aggregate({
          where: { companyId, date: { gte: monthStart } },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.expense.aggregate({
          where: {
            companyId,
            date: { gte: lastMonthStart, lte: lastMonthEnd },
          },
          _sum: { amount: true },
        }),
        this.prisma.expense.count({
          where: { companyId, status: ExpenseStatus.PENDING },
        }),
        this.prisma.expense.groupBy({
          by: ['categoryName'],
          where: { companyId, date: { gte: monthStart } },
          _sum: { amount: true },
          orderBy: { _sum: { amount: 'desc' } },
        }),
        this.prisma.expense.groupBy({
          by: ['paymentMode'],
          where: { companyId, date: { gte: monthStart } },
          _sum: { amount: true },
          orderBy: { paymentMode: 'asc' },
        }),
      ]);

    const thisTotal = Number(thisMonth._sum.amount ?? 0);
    const lastTotal = Number(lastMonth._sum.amount ?? 0);
    const trend =
      lastTotal > 0 ? ((thisTotal - lastTotal) / lastTotal) * 100 : 0;

    const topCategory = byCategory[0]
      ? {
          name: byCategory[0].categoryName,
          amount: Number(byCategory[0]._sum?.amount ?? 0),
        }
      : null;

    // Cash vs digital
    const cashAmount = Number(
      byMode.find((m) => m.paymentMode === 'CASH')?._sum?.amount ?? 0,
    );
    const cashPercent =
      thisTotal > 0 ? Math.round((cashAmount / thisTotal) * 100) : 0;

    return {
      totalThisMonth: thisTotal,
      invoiceCount: thisMonth._count,
      trendPercent: Math.round(trend * 10) / 10,
      pendingApproval: pending,
      topCategory,
      cashPercent,
      digitalPercent: 100 - cashPercent,
      byCategory: byCategory.map((c) => ({
        name: c.categoryName,
        amount: Number(c._sum?.amount ?? 0),
      })),
    };
  }

  // ─── Find one ────────────────────────────────────────────────────────────
  async findOne(companyId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, companyId },
      include: { vendor: true, category: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  // ─── Update ──────────────────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateExpenseDto) {
    // 1. Verify the expense exists and belongs to this company
    const existing = await this.prisma.expense.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException();

    // 2. Update the expense record
    const updated = await this.prisma.expense.update({
      where: { id },
      data: dto,
    });

    // 3. When a recurring-generated expense is marked PAID, advance the
    //    recurring schedule's `nextDue` so it stops showing as overdue.
    //
    //    WHY: RecurringExpense is a SCHEDULE ("charge ₹700 every month for wifi").
    //    Paying the expense updates the Expense table only. The schedule must
    //    also advance its `nextDue` — otherwise it keeps showing "Overdue by 1 day"
    //    even after you've paid it.
    //
    //    FIELD NAMES (from your actual schema.prisma):
    //      Expense.recurringId          ← links to its recurring schedule
    //      RecurringExpense.nextDue     ← next due date (NOT nextDueDate)
    //      RecurringExpense.frequency   ← RecurringFrequency enum
    //      RecurringExpense.lastPaidAt  ← add to schema (schema-additions.txt)
    //      RecurringExpense.lastPaidAmount ← add to schema (schema-additions.txt)

    const isNowPaid = dto.status === 'PAID' && existing.status !== 'PAID';

    // Only advance the schedule if:
    //   a) expense was just marked PAID (not already paid)
    //   b) expense was generated from a recurring schedule (recurringId is set)
    if (isNowPaid && existing.recurringId) {
      const schedule = await this.prisma.recurringExpense.findUnique({
        where: { id: existing.recurringId }, // ✅ recurringId (not recurringExpenseId)
      });

      if (schedule) {
        // Advance to the next period based on frequency
        // e.g. MONTHLY: Aug 7 → Sep 7
        const nextDue = calculateNextDueDate(
          schedule.nextDue, // ✅ nextDue (not nextDueDate)
          schedule.frequency,
        );

        await this.prisma.recurringExpense.update({
          where: { id: schedule.id },
          data: {
            nextDue,
            lastPaidAt: new Date(),
            lastPaidAmount: existing.amount,
          },
        });
      }
    }

    return updated;
  }

  // ─── Delete ──────────────────────────────────────────────────────────────
  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    await this.prisma.expense.delete({ where: { id } });
    return { message: 'Expense deleted successfully' };
  }
}
