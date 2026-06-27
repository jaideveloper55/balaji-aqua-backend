import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── CREATE ───
  async create(companyId: string, dto: CreateProductDto) {
    // Verify category belongs to this company
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, companyId },
    });
    if (!category) {
      throw new BadRequestException('Category not found in this company');
    }

    // Auto-derive status from stock
    const status = this.deriveStatus(dto.stock ?? 0, dto.status);

    try {
      return await this.prisma.product.create({
        data: {
          name: dto.name.trim(),
          sku: dto.sku.trim().toUpperCase(),
          categoryId: dto.categoryId,
          unit: dto.unit ?? 'PCS',
          status,
          hsn: dto.hsn,
          description: dto.description,
          basePrice: dto.basePrice,
          costPrice: dto.costPrice ?? 0,
          gstRate: dto.gstRate ?? 0,
          stock: dto.stock ?? 0,
          minStock: dto.minStock ?? 0,
          companyId,
        },
        include: { category: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `SKU "${dto.sku}" already exists in this company`,
        );
      }
      throw err;
    }
  }

  // ─── LIST with filters + pagination ───
  async findAll(companyId: string, query: QueryProductDto) {
    const {
      search,
      categoryId,
      status,
      isSellable,
      dateFrom,
      dateTo,
      page = 1,
      pageSize = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const where: Prisma.ProductWhereInput = {
      companyId,
    };

    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;

    if (typeof isSellable === 'boolean') {
      where.isSellable = isSellable;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { id: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }


  // ─── STATS — for the 4 dashboard cards ───
  async getStats(companyId: string) {
    const [total, active, outOfStock, lowStock] = await Promise.all([
      this.prisma.product.count({ where: { companyId } }),
      this.prisma.product.count({
        where: { companyId, status: ProductStatus.ACTIVE },
      }),
      this.prisma.product.count({
        where: { companyId, stock: 0 },
      }),
      // low stock = stock > 0 AND stock <= minStock AND minStock > 0
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint as count
          FROM products
          WHERE "companyId" = ${companyId}
            AND stock > 0
            AND "minStock" > 0
            AND stock <= "minStock"
        `.then((rows) => Number(rows[0]?.count ?? 0)),
    ]);

    return { total, active, outOfStock, lowStock };
  }

  // ─── ALERTS — derived directly from products ───
  async getAlerts(companyId: string) {
    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        OR: [
          { stock: 0 },
          { AND: [{ stock: { gt: 0 } }, { minStock: { gt: 0 } }] },
        ],
      },
      include: { category: true },
    });

    const alerts = products
      .filter((p) => p.stock === 0 || p.stock <= p.minStock)
      .map((p) => {
        const isOut = p.stock === 0;
        return {
          id: `${p.id}-${isOut ? 'out' : 'low'}`,
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          severity: isOut ? 'critical' : 'warning',
          stock: p.stock,
          minStock: p.minStock,
          unit: p.unit,
          message: isOut
            ? `${p.name} is out of stock. Reorder immediately.`
            : `${p.name} stock (${p.stock}) is below minimum (${p.minStock}).`,
        };
      });

    // critical first
    alerts.sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1,
    );

    return alerts;
  }

  // ─── GET ONE ───
  async findOne(companyId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
      include: { category: true },
    });

    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    return product;
  }

  // ─── UPDATE ───
  async update(companyId: string, id: string, dto: UpdateProductDto) {
    const existing = await this.findOne(companyId, id);

    if (dto.categoryId && dto.categoryId !== existing.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, companyId },
      });
      if (!category) {
        throw new BadRequestException('Category not found in this company');
      }
    }

    // Re-derive status if stock is being updated
    const newStock = dto.stock ?? existing.stock;
    const status = this.deriveStatus(newStock, dto.status ?? existing.status);

    try {
      return await this.prisma.product.update({
        where: { id },
        data: {
          ...dto,
          sku: dto.sku?.trim().toUpperCase(),
          name: dto.name?.trim(),
          status,
        },
        include: { category: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `SKU "${dto.sku}" already exists in this company`,
        );
      }
      throw err;
    }
  }

  // ─── DELETE ───
  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { productId: id } });
      await tx.invoiceItem.deleteMany({ where: { productId: id } });
      await tx.cartItem.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    });

    return { message: 'Product deleted successfully' };
  }

  // ─── BULK DELETE ───

  async removeMany(companyId: string, ids: string[]) {
    if (!ids?.length) throw new BadRequestException('No product IDs provided');

    // verify all belong to this company (tenant safety)
    const owned = await this.prisma.product.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true },
    });
    const ownedIds = owned.map((p) => p.id);
    if (ownedIds.length === 0) {
      throw new BadRequestException('No matching products found');
    }

    // Delete children then parents, atomically
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({
        where: { productId: { in: ownedIds } },
      });
      await tx.invoiceItem.deleteMany({
        where: { productId: { in: ownedIds } },
      });
      await tx.cartItem.deleteMany({ where: { productId: { in: ownedIds } } });
      return tx.product.deleteMany({ where: { id: { in: ownedIds } } });
    });

    return {
      message: `${result.count} product(s) permanently deleted`,
      count: result.count,
    };
  }

  // ─── HELPERS ───

  /** Auto-derive status from stock unless explicitly INACTIVE */
  private deriveStatus(stock: number, current?: ProductStatus): ProductStatus {
    if (current === ProductStatus.INACTIVE) return ProductStatus.INACTIVE;
    if (stock === 0) return ProductStatus.OUT_OF_STOCK;
    return ProductStatus.ACTIVE;
  }
}
