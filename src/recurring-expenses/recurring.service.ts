import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, RecurringFrequency } from '@prisma/client';
import { CreateRecurringDto } from './dto/create-recurring.dto';
import { UpdateRecurringDto } from './dto/update-recurring.dto';
import { QueryRecurringDto } from './dto/query-recurring.dto';

@Injectable()
export class RecurringService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Advance a date by frequency ─────────────────────────────────────────
  private advanceDate(date: Date, freq: RecurringFrequency): Date {
    const d = new Date(date);
    switch (freq) {
      case 'WEEKLY':
        d.setDate(d.getDate() + 7);
        break;
      case 'MONTHLY':
        d.setMonth(d.getMonth() + 1);
        break;
      case 'QUARTERLY':
        d.setMonth(d.getMonth() + 3);
        break;
      case 'YEARLY':
        d.setFullYear(d.getFullYear() + 1);
        break;
    }
    return d;
  }

  // ─── Create ──────────────────────────────────────────────────────────────
  async create(companyId: string, dto: CreateRecurringDto) {
    return this.prisma.recurringExpense.create({
      data: {
        companyId,
        name: dto.name,
        vendorName: dto.vendorName,
        vendorId: dto.vendorId ?? null,
        categoryId: dto.categoryId ?? null,
        categoryName: dto.categoryName,
        frequency: dto.frequency,
        amount: new Prisma.Decimal(dto.amount),
        nextDue: new Date(dto.nextDue),
        reminderDays: dto.reminderDays ?? 5,
      },
    });
  }

  // ─── List ────────────────────────────────────────────────────────────────
  async findAll(companyId: string, query: QueryRecurringDto) {
    const where: Prisma.RecurringExpenseWhereInput = { companyId };
    if (query.search)
      where.name = { contains: query.search, mode: 'insensitive' };
    if (query.pausedOnly === 'true') where.isPaused = true;

    return this.prisma.recurringExpense.findMany({
      where,
      orderBy: { nextDue: 'asc' },
    });
  }

  // ─── Stats ───────────────────────────────────────────────────────────────
  async getStats(companyId: string) {
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 7);
    const fiveDays = new Date(now);
    fiveDays.setDate(now.getDate() + 5);

    const [active, paused, monthlyAgg, dueThisWeek, urgent] =
      await this.prisma.$transaction([
        this.prisma.recurringExpense.count({
          where: { companyId, isPaused: false },
        }),
        this.prisma.recurringExpense.count({
          where: { companyId, isPaused: true },
        }),
        this.prisma.recurringExpense.aggregate({
          where: { companyId, isPaused: false, frequency: 'MONTHLY' },
          _sum: { amount: true },
        }),
        this.prisma.recurringExpense.count({
          where: { companyId, isPaused: false, nextDue: { lte: weekEnd } },
        }),
        this.prisma.recurringExpense.count({
          where: { companyId, isPaused: false, nextDue: { lte: fiveDays } },
        }),
      ]);

    return {
      activeCount: active,
      pausedCount: paused,
      monthlyCommitment: Number(monthlyAgg._sum.amount ?? 0),
      dueThisWeek,
      urgent,
    };
  }

  // ─── Find one ────────────────────────────────────────────────────────────
  async findOne(companyId: string, id: string) {
    const item = await this.prisma.recurringExpense.findFirst({
      where: { id, companyId },
    });
    if (!item) throw new NotFoundException('Recurring schedule not found');
    return item;
  }

  // ─── Update ──────────────────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateRecurringDto) {
    await this.findOne(companyId, id);
    const data: Prisma.RecurringExpenseUpdateInput = { ...dto } as any;
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.nextDue !== undefined) data.nextDue = new Date(dto.nextDue);
    return this.prisma.recurringExpense.update({ where: { id }, data });
  }

  // ─── Toggle pause ────────────────────────────────────────────────────────
  async togglePause(companyId: string, id: string) {
    const item = await this.findOne(companyId, id);
    return this.prisma.recurringExpense.update({
      where: { id },
      data: { isPaused: !item.isPaused },
    });
  }

  // ─── Delete ──────────────────────────────────────────────────────────────
  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    await this.prisma.recurringExpense.delete({ where: { id } });
    return { message: 'Recurring schedule deleted' };
  }

  // ─── Get active reminders (due within reminderDays, not acknowledged) ────
  async getReminders(companyId: string) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Pull all active schedules for the company
    const schedules = await this.prisma.recurringExpense.findMany({
      where: { companyId, isPaused: false },
      orderBy: { nextDue: 'asc' },
    });

    const reminders = schedules
      .map((s) => {
        const due = new Date(s.nextDue);
        due.setHours(0, 0, 0, 0);

        // days until due (negative = overdue)
        const daysUntil = Math.round(
          (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );

        // Only remind once we're inside the lead window
        const inWindow = daysUntil <= s.reminderDays;
        if (!inWindow) return null;

        // Skip if user already acknowledged THIS cycle's due date
        const acked =
          s.reminderAckedFor &&
          new Date(s.reminderAckedFor).setHours(0, 0, 0, 0) === due.getTime();
        if (acked) return null;

        // Tiered severity
        let severity: 'gentle' | 'urgent' | 'critical';
        if (daysUntil < 0)
          severity = 'critical'; // overdue
        else if (daysUntil <= 2)
          severity = 'urgent'; // 0-2 days
        else severity = 'gentle'; // 3+ days

        return {
          id: s.id,
          name: s.name,
          vendorName: s.vendorName,
          categoryName: s.categoryName,
          amount: Number(s.amount),
          nextDue: s.nextDue,
          daysUntil,
          severity,
          message:
            daysUntil < 0
              ? `${s.name} is overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'}`
              : daysUntil === 0
                ? `${s.name} is due today`
                : `${s.name} is due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
        };
      })
      .filter((r) => r !== null);

    // Sort most-urgent first
    const order = { critical: 0, urgent: 1, gentle: 2 };
    reminders.sort((a: any, b: any) => order[a.severity] - order[b.severity]);

    return {
      count: reminders.length,
      reminders,
    };
  }

  // ─── Acknowledge a reminder (stops it for THIS cycle only) ───────────────
  async acknowledge(companyId: string, id: string) {
    const schedule = await this.findOne(companyId, id);
    return this.prisma.recurringExpense.update({
      where: { id },
      data: { reminderAckedFor: schedule.nextDue },
    });
  }

  // ─── Generate an expense number (per company) ────────────────────────────
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

  // ─── CRON: auto-generate due expenses (called daily) ─────────────────────
  async processDueSchedules(): Promise<{ generated: number }> {
    const now = new Date();
    const due = await this.prisma.recurringExpense.findMany({
      where: { isPaused: false, nextDue: { lte: now } },
    });

    let generated = 0;
    for (const schedule of due) {
      await this.prisma.$transaction(async (tx) => {
        const expenseNo = await this.generateExpenseNo(schedule.companyId);
        await tx.expense.create({
          data: {
            companyId: schedule.companyId,
            expenseNo,
            vendorName: schedule.vendorName,
            vendorId: schedule.vendorId,
            description: `${schedule.name} (auto-generated)`,
            categoryId: schedule.categoryId,
            categoryName: schedule.categoryName,
            amount: schedule.amount,
            gstAmount: new Prisma.Decimal(0),
            paymentMode: 'BANK_TRANSFER',
            status: 'PENDING',
            date: schedule.nextDue,
            recurringId: schedule.id,
          },
        });
        await tx.recurringExpense.update({
          where: { id: schedule.id },
          data: {
            nextDue: this.advanceDate(schedule.nextDue, schedule.frequency),
            lastGeneratedAt: now,
            reminderAckedFor: null, // reset — new cycle should remind fresh
          },
        });
      });
      generated++;
    }
    return { generated };
  }
}
