import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, MovementType, MovementSource } from '@prisma/client';
import { AdjustStockDto } from './dto/Adjust stock.dto';
import { StockInDto } from './dto/Stock in.dto';
import { StockOutDto, StockOutSource } from './dto/Stock out.dto';
import {
  MovementHistoryQueryDto,
  StockListQueryDto,
  StockStatusFilter,
} from './dto/Query.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private deriveStatus(
    stock: number,
    reserved: number,
    minStock: number,
  ): 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
    if (stock <= 0) return 'OUT_OF_STOCK';
    const available = stock - reserved;
    if (available <= minStock) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  private shapeProductRow(p: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    stock: number;
    reserved: number;
    minStock: number;
    isSellable: boolean;
    category?: { id: string; name: string } | null;
  }) {
    const available = p.stock - p.reserved;
    const denom = p.stock <= 0 ? 1 : p.stock;
    const healthPct = Math.max(
      0,
      Math.min(100, Math.round((available / denom) * 100)),
    );
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      category: p.category?.name ?? null,
      categoryId: p.category?.id ?? null,
      current: p.stock,
      reserved: p.reserved,
      available,
      reorderLevel: p.minStock,
      stockHealth: healthPct,
      isSellable: p.isSellable,
      status: this.deriveStatus(p.stock, p.reserved, p.minStock),
    };
  }

  //  STOCK IN
  async stockIn(dto: StockInDto, companyId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await this.lockProduct(tx, dto.productId, companyId);

      const newStock = product.stock + dto.quantity;

      await tx.product.update({
        where: { id: product.id },
        data: { stock: newStock },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unit: product.unit,
          type: MovementType.STOCK_IN,
          source: dto.source as unknown as MovementSource,
          quantity: dto.quantity,
          balanceAfter: newStock,
          referenceId: dto.referenceId,
          remarks: dto.remarks,
          createdById: userId,
          companyId,
        },
      });

      return { movement, product: { id: product.id, stock: newStock } };
    });
  }

  //  STOCK OUT
  async stockOut(dto: StockOutDto, companyId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await this.lockProduct(tx, dto.productId, companyId);

      const available = product.stock - product.reserved;

      // Cannot issue more than what is AVAILABLE (not just physical stock),
      // otherwise you eat into reserved/committed units.
      if (dto.quantity > available) {
        throw new BadRequestException(
          `Cannot issue ${dto.quantity} ${product.unit}. Only ${available} available ` +
            `(${product.stock} in stock, ${product.reserved} reserved).`,
        );
      }

      const newStock = product.stock - dto.quantity;
      const isDamage = dto.source === StockOutSource.DAMAGE;

      await tx.product.update({
        where: { id: product.id },
        data: {
          stock: newStock,
          // Damage / Breakage also feeds the "Damaged Items" KPI card
          ...(isDamage ? { damaged: { increment: dto.quantity } } : {}),
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unit: product.unit,
          type: MovementType.STOCK_OUT,
          source: dto.source as unknown as MovementSource,
          quantity: -dto.quantity,
          balanceAfter: newStock,
          referenceId: dto.referenceId,
          remarks: dto.remarks,
          createdById: userId,
          companyId,
        },
      });

      return { movement, product: { id: product.id, stock: newStock } };
    });
  }

  // ADJUST
  async adjust(dto: AdjustStockDto, companyId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await this.lockProduct(tx, dto.productId, companyId);

      const delta = dto.countedQuantity - product.stock;

      if (delta === 0) {
        throw new BadRequestException(
          `Counted quantity (${dto.countedQuantity}) matches current stock. No adjustment needed.`,
        );
      }

      // A downward correction can't take physical stock below what's reserved.
      if (dto.countedQuantity < product.reserved) {
        throw new BadRequestException(
          `Counted quantity (${dto.countedQuantity}) is less than reserved (${product.reserved}). ` +
            `Release reservations before correcting downward.`,
        );
      }

      await tx.product.update({
        where: { id: product.id },
        data: { stock: dto.countedQuantity },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unit: product.unit,
          type: MovementType.ADJUSTMENT,
          source: MovementSource.STOCK_COUNT_CORRECTION,
          quantity: delta, // signed: +/-
          balanceAfter: dto.countedQuantity,
          referenceId: dto.referenceId,
          remarks: dto.remarks,
          createdById: userId,
          companyId,
        },
      });

      return {
        movement,
        product: { id: product.id, stock: dto.countedQuantity },
        delta,
      };
    });
  }

  private async lockProduct(
    tx: Prisma.TransactionClient,
    productId: string,
    companyId: string,
  ) {
    // Lock the row first
    const locked = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM products WHERE id = ${productId} AND "companyId" = ${companyId} FOR UPDATE`;

    if (locked.length === 0) {
      throw new NotFoundException('Product not found');
    }

    const product = await tx.product.findUnique({
      where: { id: productId },
    });
    if (!product || product.companyId !== companyId) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  //  STOCK LIST

  async getStockList(query: StockListQueryDto, companyId: string) {
    const { search, status, categoryId, page = 1, limit = 20 } = query;

    const where: Prisma.ProductWhereInput = {
      companyId,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;

    const all = await this.prisma.product.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    let rows = all.map((p) => this.shapeProductRow(p));

    if (status) {
      const want =
        status === StockStatusFilter.IN_STOCK
          ? 'IN_STOCK'
          : status === StockStatusFilter.LOW_STOCK
            ? 'LOW_STOCK'
            : 'OUT_OF_STOCK';
      rows = rows.filter((r) => r.status === want);
    }

    const total = rows.length;
    const start = (page - 1) * limit;
    const data = rows.slice(start, start + limit);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  //  LOW STOCK ALERTS
  async getLowStockAlerts(companyId: string) {
    const products = await this.prisma.product.findMany({
      where: { companyId, isSellable: true },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { stock: 'asc' },
    });

    const alerts = products
      .map((p) => this.shapeProductRow(p))
      .filter((r) => r.status !== 'IN_STOCK')
      .map((r) => ({
        ...r,
        deficit: r.available - r.reorderLevel,
        critical: r.status === 'OUT_OF_STOCK',
      }));

    return {
      data: alerts,
      meta: {
        total: alerts.length,
        critical: alerts.filter((a) => a.critical).length,
      },
    };
  }

  //  MOVEMENT HISTORY

  async getMovementHistory(query: MovementHistoryQueryDto, companyId: string) {
    const {
      search,
      type,
      categoryId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = query;

    const where: Prisma.StockMovementWhereInput = { companyId };

    if (type) where.type = type as MovementType;
    if (search) {
      where.OR = [
        { productName: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId) where.product = { categoryId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [movements, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    const data = movements.map((m) => ({
      id: m.id,
      date: m.createdAt,
      product: { name: m.productName, sku: m.sku },
      type: m.type,
      quantity: m.quantity,
      balance: m.balanceAfter,
      source: m.source,
      referenceId: m.referenceId,
      user: `${m.createdBy.firstName} ${m.createdBy.lastName}`.trim(),
      remarks: m.remarks,
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  //  KPI SUMMARY
  async getSummary(companyId: string) {
    const products = await this.prisma.product.findMany({
      where: { companyId, isSellable: true },
      select: {
        stock: true,
        reserved: true,
        minStock: true,
        damaged: true,
        basePrice: true,
      },
    });

    let totalStockValue = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let damagedItems = 0;

    for (const p of products) {
      totalStockValue += p.stock * p.basePrice;
      damagedItems += p.damaged;
      const status = this.deriveStatus(p.stock, p.reserved, p.minStock);
      if (status === 'LOW_STOCK') lowStock++;
      if (status === 'OUT_OF_STOCK') outOfStock++;
    }

    // Today's inward/outward from the ledger
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayMovements = await this.prisma.stockMovement.findMany({
      where: { companyId, createdAt: { gte: startOfDay } },
      select: { type: true, quantity: true },
    });

    let inwardToday = 0;
    let outwardToday = 0;
    for (const m of todayMovements) {
      if (m.type === MovementType.STOCK_IN) inwardToday += m.quantity;
      if (m.type === MovementType.STOCK_OUT)
        outwardToday += Math.abs(m.quantity);
    }

    return {
      totalStockValue,
      lowStock,
      outOfStock,
      damagedItems,
      inwardToday,
      outwardToday,
    };
  }
}
