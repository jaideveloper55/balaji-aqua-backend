import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { NotificationService } from 'src/notifications/notification.service';
import { SetBomDto } from './dto/bom.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  // ─── CREATE ───
  async create(companyId: string, dto: CreateProductDto) {
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, companyId },
    });
    if (!category) {
      throw new BadRequestException('Category not found in this company');
    }

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

  // ─── LIST
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

  // ─── STATS —
  async getStats(companyId: string) {
    const [total, active, outOfStock, lowStock] = await Promise.all([
      this.prisma.product.count({ where: { companyId } }),
      this.prisma.product.count({
        where: { companyId, status: ProductStatus.ACTIVE },
      }),
      this.prisma.product.count({
        where: { companyId, stock: 0 },
      }),

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

  // ─── ALERTS

  async getAlerts(companyId: string) {
    const products = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        sku: string;
        stock: number;
        minStock: number;
        unit: string;
      }[]
    >`
      SELECT id, name, sku, stock, "minStock", unit
      FROM products
      WHERE "companyId" = ${companyId}
        AND (
          stock = 0
          OR (stock > 0 AND "minStock" > 0 AND stock <= "minStock")
        )
      ORDER BY stock ASC
    `;

    const alerts = products.map((p) => {
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

    alerts.sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1,
    );

    return alerts;
  }

  // ─── GET ONE
  async findOne(companyId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
      include: {
        category: true,

        bomLines: {
          include: {
            component: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
                stock: true,
              },
            },
          },
        },
      },
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

    const newStock = dto.stock ?? existing.stock;
    const status = this.deriveStatus(newStock, dto.status ?? existing.status);

    try {
      const updated = await this.prisma.product.update({
        where: { id },
        data: {
          ...dto,
          sku: dto.sku?.trim().toUpperCase(),
          name: dto.name?.trim(),
          status,
        },
        include: {
          category: true,
          company: { select: { name: true } },
        },
      });

      const stockChanged =
        dto.stock !== undefined && dto.stock !== existing.stock;
      const minStockChanged =
        dto.minStock !== undefined && dto.minStock !== existing.minStock;

      if (stockChanged || minStockChanged) {
        if (updated.stock === 0) {
          void this.notifications
            .notifyOutOfStock({
              companyName: updated.company.name,
              productName: updated.name,
              sku: updated.sku,
              unit: updated.unit,
            })
            .catch((err) => {
              this.logger.error(
                `Failed to send out-of-stock notification for ${updated.sku}`,
                err,
              );
            });
        } else if (updated.minStock > 0 && updated.stock <= updated.minStock) {
          void this.notifications
            .notifyLowStock({
              companyName: updated.company.name,
              productName: updated.name,
              sku: updated.sku,
              stock: updated.stock,
              minStock: updated.minStock,
              unit: updated.unit,
            })
            .catch((err) => {
              this.logger.error(
                `Failed to send low-stock notification for ${updated.sku}`,
                err,
              );
            });
        }
      }

      return updated;
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
    const product = await this.findOne(companyId, id);

    const [invoiceItemCount, usedInBomCount] = await Promise.all([
      this.prisma.invoiceItem.count({ where: { productId: id, companyId } }),
      this.prisma.productBom.count({ where: { componentId: id, companyId } }),
    ]);

    if (usedInBomCount > 0) {
      throw new ConflictException(
        `Cannot delete "${product.name}" — it is a raw material in ` +
          `${usedInBomCount} product recipe(s). Remove it from those ` +
          `bills of materials first.`,
      );
    }

    if (invoiceItemCount > 0) {
      throw new ConflictException(
        `Cannot delete "${product.name}" — it appears on ${invoiceItemCount} ` +
          `invoice line item(s). Deleting it would corrupt billing history. ` +
          `Set status to INACTIVE instead to hide it from active lists.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { productId: id } });
      await tx.productBom.deleteMany({ where: { productId: id } });
      await tx.stockMovement.deleteMany({
        where: { productId: id, companyId },
      });
      await tx.product.delete({ where: { id } });
    });

    return { message: 'Product deleted successfully' };
  }

  // ─── FORCE DELETE (permanent, destroys history) ───
  async forceRemove(companyId: string, id: string) {
    const product = await this.findOne(companyId, id);

    // Count what we're about to destroy so we can report it back
    const [invoiceItemCount, stockMovementCount, bomUsageCount] =
      await Promise.all([
        this.prisma.invoiceItem.count({ where: { productId: id, companyId } }),
        this.prisma.stockMovement.count({
          where: { productId: id, companyId },
        }),
        this.prisma.productBom.count({
          where: { OR: [{ productId: id }, { componentId: id }], companyId },
        }),
      ]);

    // Destructive action — always leave a trace in the logs
    this.logger.warn(
      `FORCE DELETE by company ${companyId}: "${product.name}" (${product.sku}) — ` +
        `destroying ${invoiceItemCount} invoice item(s), ` +
        `${stockMovementCount} stock movement(s), ${bomUsageCount} BOM line(s)`,
    );

    await this.prisma.$transaction(async (tx) => {
      // Order matters: children before parent, or Postgres rejects the delete

      // 1. Open carts
      await tx.cartItem.deleteMany({ where: { productId: id } });

      await tx.productBom.deleteMany({
        where: { OR: [{ productId: id }, { componentId: id }] },
      });

      // 3. Stock movement audit trail
      await tx.stockMovement.deleteMany({
        where: { productId: id, companyId },
      });

      // 4. Invoice line items — this is the destructive one
      await tx.invoiceItem.deleteMany({ where: { productId: id, companyId } });

      // 5. Finally the product itself
      await tx.product.delete({ where: { id } });
    });

    return {
      message: `"${product.name}" permanently deleted`,
      destroyed: {
        invoiceItems: invoiceItemCount,
        stockMovements: stockMovementCount,
        bomLines: bomUsageCount,
      },
      warning:
        invoiceItemCount > 0
          ? `${invoiceItemCount} invoice line item(s) were deleted. ` +
            `Affected invoices will show incomplete item lists.`
          : undefined,
    };
  }

  // ─── BULK DELETE ───

  async removeMany(companyId: string, ids: string[]) {
    if (!ids?.length) throw new BadRequestException('No product IDs provided');

    const owned = await this.prisma.product.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true },
    });
    const ownedIds = owned.map((p) => p.id);
    if (ownedIds.length === 0) {
      throw new BadRequestException('No matching products found');
    }

    // Find which of these products have protected history.
    const [withInvoices, usedAsComponent] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: { productId: { in: ownedIds } },
        select: { productId: true },
        distinct: ['productId'],
      }),
      this.prisma.productBom.findMany({
        where: { componentId: { in: ownedIds }, companyId },
        select: { componentId: true },
        distinct: ['componentId'],
      }),
    ]);

    const protectedIds = new Set([
      ...withInvoices.map((i) => i.productId),
      ...usedAsComponent.map((b) => b.componentId),
    ]);

    const deletableIds = ownedIds.filter((pid) => !protectedIds.has(pid));

    if (deletableIds.length === 0) {
      throw new ConflictException(
        'None of the selected products can be deleted — all of them have ' +
          'invoice history, stock history, or are used as raw materials ' +
          'in a product recipe. Set them to INACTIVE instead.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({
        where: { productId: { in: deletableIds } },
      });
      await tx.productBom.deleteMany({
        where: { productId: { in: deletableIds } },
      });
      await tx.stockMovement.deleteMany({
        where: { productId: { in: deletableIds }, companyId },
      });
      return tx.product.deleteMany({ where: { id: { in: deletableIds } } });
    });

    return {
      message: `${result.count} product(s) permanently deleted`,
      count: result.count,
      skipped: ownedIds.length - deletableIds.length,
      skippedReason:
        protectedIds.size > 0
          ? 'Some products were skipped because they have invoice history, ' +
            'stock history, or are used as raw materials in a recipe'
          : undefined,
    };
  }

  async setBom(companyId: string, id: string, dto: SetBomDto) {
    // Reuse the existing ownership check — throws NotFoundException for us
    await this.findOne(companyId, id);

    const componentIds = dto.lines.map((l) => l.componentId);

    // A product cannot be an ingredient of itself
    if (componentIds.includes(id)) {
      throw new BadRequestException(
        'A product cannot be a component of itself',
      );
    }

    // Reject duplicate components. The DB has @@unique([productId, componentId]),
    // so createMany would throw a raw P2002. Catching it here gives the
    // frontend a message it can actually display.
    if (new Set(componentIds).size !== componentIds.length) {
      throw new BadRequestException(
        'Duplicate raw materials in the recipe — combine them into one line',
      );
    }

    // Prevent circular recipes: block A→B when B→A already exists.
    // explodeBom only walks one level so a cycle wouldn't hang the server,
    // but the data would be meaningless.
    const reverse = await this.prisma.productBom.findFirst({
      where: { productId: { in: componentIds }, componentId: id, companyId },
      include: { product: { select: { name: true } } },
    });
    if (reverse) {
      throw new BadRequestException(
        `Circular recipe: "${reverse.product.name}" already consumes this product`,
      );
    }

    // Every component must exist inside THIS company (tenant isolation)
    const components = await this.prisma.product.findMany({
      where: { id: { in: componentIds }, companyId },
      select: { id: true },
    });
    if (components.length !== componentIds.length) {
      throw new BadRequestException(
        'One or more raw materials not found in this company',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Delete-then-recreate is the simplest correct way to handle
      // lines the user removed in the UI.
      await tx.productBom.deleteMany({ where: { productId: id, companyId } });

      await tx.productBom.createMany({
        data: dto.lines.map((l) => ({
          productId: id,
          componentId: l.componentId,
          quantityPerUnit: l.quantityPerUnit,
          companyId,
        })),
      });

      // Flip the switch that billing checks
      await tx.product.update({
        where: { id },
        data: { consumesBom: true },
      });
    });

    return this.getBom(companyId, id);
  }

  // ─── BOM: GET (recipe + live component stock) ───

  async getBom(companyId: string, id: string) {
    const product = await this.findOne(companyId, id);

    const lines = await this.prisma.productBom.findMany({
      where: { productId: id, companyId },
      include: {
        component: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            stock: true,
            reserved: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const shaped = lines.map((l) => {
      const available = l.component.stock - l.component.reserved;
      return {
        id: l.id,
        componentId: l.componentId,
        name: l.component.name,
        sku: l.component.sku,
        unit: l.component.unit,
        category: l.component.category?.name ?? null,
        quantityPerUnit: l.quantityPerUnit,
        currentStock: l.component.stock,
        available,
        // How many finished goods this single ingredient allows
        buildableUnits: Math.floor(available / l.quantityPerUnit),
      };
    });

    return {
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        consumesBom: product.consumesBom,
      },
      lines: shaped,
      // The bottleneck ingredient decides how much you can actually make
      maxBuildable: shaped.length
        ? Math.min(...shaped.map((l) => l.buildableUnits))
        : null,
    };
  }

  // ─── BOM: CLEAR ───

  async clearBom(companyId: string, id: string) {
    await this.findOne(companyId, id);

    await this.prisma.$transaction([
      this.prisma.productBom.deleteMany({
        where: { productId: id, companyId },
      }),
      this.prisma.product.update({
        where: { id },
        data: { consumesBom: false },
      }),
    ]);

    return { message: 'BOM cleared successfully' };
  }

  // ─── HELPERS ───
  private deriveStatus(stock: number, current?: ProductStatus): ProductStatus {
    if (current === ProductStatus.INACTIVE) return ProductStatus.INACTIVE;
    if (stock === 0) return ProductStatus.OUT_OF_STOCK;
    return ProductStatus.ACTIVE;
  }
}
