import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AddCashDto } from './dto/add-cash.dto';
import { SpendCashDto } from './dto/spend-cash.dto';
import { QueryPettyCashDto } from './dto/query-petty-cash.dto';

@Injectable()
export class PettyCashService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Get or create the company's cash box ────────────────────────────────
  private async getBox(companyId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    let box = await client.pettyCashBox.findUnique({ where: { companyId } });
    if (!box) {
      box = await client.pettyCashBox.create({
        data: {
          companyId,
          currentBalance: new Prisma.Decimal(0),
          openingBalance: new Prisma.Decimal(0),
        },
      });
    }
    return box;
  }

  // ─── Generate txn number (per company, C-XX) ─────────────────────────────
  private async generateTxnNo(
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const count = await tx.pettyCashTransaction.count({ where: { companyId } });
    return `C-${String(count + 1).padStart(2, '0')}`;
  }

  // ─── Current balance + today's activity ──────────────────────────────────
  async getBalance(companyId: string) {
    const box = await this.getBox(companyId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [cashIn, cashOut] = await this.prisma.$transaction([
      this.prisma.pettyCashTransaction.aggregate({
        where: { companyId, direction: 'IN', txnDate: { gte: todayStart } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.pettyCashTransaction.aggregate({
        where: { companyId, direction: 'OUT', txnDate: { gte: todayStart } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return {
      currentBalance: Number(box.currentBalance),
      openingBalance: Number(box.openingBalance),
      reconciledTill: box.reconciledTill,
      today: {
        cashIn: Number(cashIn._sum.amount ?? 0),
        cashInCount: cashIn._count,
        cashOut: Number(cashOut._sum.amount ?? 0),
        cashOutCount: cashOut._count,
      },
    };
  }

  // ─── Add cash (IN) ───────────────────────────────────────────────────────
  async addCash(companyId: string, dto: AddCashDto) {
    return this.prisma.$transaction(async (tx) => {
      const box = await this.getBox(companyId, tx);
      const newBalance = new Prisma.Decimal(box.currentBalance).plus(
        dto.amount,
      );
      const txnNo = await this.generateTxnNo(companyId, tx);

      const txn = await tx.pettyCashTransaction.create({
        data: {
          companyId,
          txnNo,
          direction: 'IN',
          amount: new Prisma.Decimal(dto.amount),
          description: dto.description,
          handledById: dto.handledById ?? null,
          handledByName: dto.handledByName ?? null,
          balanceAfter: newBalance,
        },
      });
      await tx.pettyCashBox.update({
        where: { companyId },
        data: { currentBalance: newBalance },
      });
      return txn;
    });
  }

  // ─── Spend cash (OUT) ────────────────────────────────────────────────────
  async spendCash(companyId: string, dto: SpendCashDto) {
    return this.prisma.$transaction(async (tx) => {
      const box = await this.getBox(companyId, tx);
      const current = new Prisma.Decimal(box.currentBalance);
      if (current.lessThan(dto.amount)) {
        throw new BadRequestException(
          `Insufficient cash. Balance is ₹${current.toString()}, tried to spend ₹${dto.amount}`,
        );
      }
      const newBalance = current.minus(dto.amount);
      const txnNo = await this.generateTxnNo(companyId, tx);

      const txn = await tx.pettyCashTransaction.create({
        data: {
          companyId,
          txnNo,
          direction: 'OUT',
          amount: new Prisma.Decimal(dto.amount),
          description: dto.description,
          handledById: dto.handledById ?? null,
          handledByName: dto.handledByName ?? null,
          balanceAfter: newBalance,
        },
      });
      await tx.pettyCashBox.update({
        where: { companyId },
        data: { currentBalance: newBalance },
      });
      return txn;
    });
  }

  // ─── Transaction log ─────────────────────────────────────────────────────
  async getTransactions(companyId: string, query: QueryPettyCashDto) {
    const where: Prisma.PettyCashTransactionWhereInput = { companyId };
    if (query.search) {
      where.description = { contains: query.search, mode: 'insensitive' };
    }
    if (query.direction) where.direction = query.direction;
    if (query.date) {
      const start = new Date(query.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(query.date);
      end.setHours(23, 59, 59, 999);
      where.txnDate = { gte: start, lte: end };
    }
    return this.prisma.pettyCashTransaction.findMany({
      where,
      orderBy: { txnDate: 'desc' },
    });
  }

  // ─── Reconcile (mark cleared up to now) ──────────────────────────────────
  async reconcile(companyId: string) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.pettyCashTransaction.updateMany({
        where: { companyId, isReconciled: false, txnDate: { lte: now } },
        data: { isReconciled: true },
      }),
      this.prisma.pettyCashBox.update({
        where: { companyId },
        data: { reconciledTill: now },
      }),
    ]);
    return { message: 'Petty cash reconciled', reconciledTill: now };
  }
}
