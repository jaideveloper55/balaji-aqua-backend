import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Auto-generate slug from name: "Water Can" → "water_can" */
  private toSlug(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s_]/g, '')
      .replace(/\s+/g, '_');
  }

  // ─── CREATE ───
  async create(companyId: string, dto: CreateCategoryDto) {
    const slug = dto.slug || this.toSlug(dto.name);

    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name.trim(),
          slug,
          color: dto.color || '#2563eb',
          bg: dto.bg || '#dbeafe',
          description: dto.description,
          isActive: dto.isActive ?? true,
          companyId,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A category with this name or slug already exists in this company',
        );
      }
      throw err;
    }
  }

  // ─── LIST (with product counts) ───
  async findAll(companyId: string) {
    const categories = await this.prisma.category.findMany({
      where: { companyId },
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return categories.map((c) => ({
      ...c,
      productCount: c._count.products,
      _count: undefined,
    }));
  }

  // ─── GET ONE ───
  async findOne(companyId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, companyId },
      include: { _count: { select: { products: true } } },
    });

    if (!category) {
      throw new NotFoundException(`Category ${id} not found`);
    }

    return {
      ...category,
      productCount: category._count.products,
      _count: undefined,
    };
  }

  // ─── UPDATE ───
  async update(companyId: string, id: string, dto: UpdateCategoryDto) {
    await this.findOne(companyId, id); // ensures it exists & belongs to this company

    const data: Prisma.CategoryUpdateInput = { ...dto };
    if (dto.name && !dto.slug) {
      data.slug = this.toSlug(dto.name);
    }

    try {
      return await this.prisma.category.update({
        where: { id },
        data,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A category with this name or slug already exists in this company',
        );
      }
      throw err;
    }
  }

  // ─── DELETE ───
  async remove(companyId: string, id: string) {
    const category = await this.findOne(companyId, id);

    if (category.productCount > 0) {
      throw new BadRequestException(
        `Cannot delete category. ${category.productCount} product(s) are linked. Reassign them first.`,
      );
    }

    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new BadRequestException(
          'Cannot delete category — a product was just linked to it. Please try again.',
        );
      }
      throw err;
    }

    return { message: 'Category deleted successfully' };
  }
}
