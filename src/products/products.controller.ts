import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiSecurity,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';

import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentCompany } from 'src/common/guards/current-company.decorator';
import { BulkDeleteProductDto } from './dto/bulk-delete-product.dto';

@Controller('products')
@ApiTags('Products')
@ApiBearerAuth()
@ApiSecurity('X-Company-Id')
@UseGuards(JwtAuthGuard, CompanyScopeGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Create a new product' })
  create(@CurrentCompany() companyId: string, @Body() dto: CreateProductDto) {
    return this.productsService.create(companyId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List products with filters and pagination' })
  findAll(
    @CurrentCompany() companyId: string,
    @Query() query: QueryProductDto,
  ) {
    return this.productsService.findAll(companyId, query);
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get product statistics for dashboard cards' })
  getStats(@CurrentCompany() companyId: string) {
    return this.productsService.getStats(companyId);
  }

  @Get('alerts')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get low-stock and out-of-stock alerts' })
  getAlerts(@CurrentCompany() companyId: string) {
    return this.productsService.getAlerts(companyId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.DELIVERY_BOY)
  @ApiOperation({ summary: 'Get a single product by ID' })
  findOne(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.productsService.findOne(companyId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update a product' })
  update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(companyId, id, dto);
  }

  @Delete('bulk')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Bulk delete multiple products at once' })
  removeMany(
    @CurrentCompany() companyId: string,
    @Body() dto: BulkDeleteProductDto,
  ) {
    return this.productsService.removeMany(companyId, dto.ids);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a single product' })
  remove(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.productsService.remove(companyId, id);
  }
}
