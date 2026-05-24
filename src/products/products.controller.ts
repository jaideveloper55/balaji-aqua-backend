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

import { CompanyScopeGuard } from '../common/guards/company-scope.guard';

import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentCompany } from 'src/common/guards/current-company.decorator';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';

@Controller('products')
@ApiBearerAuth()
@ApiSecurity('X-Company-Id')
@UseGuards(JwtAuthGuard, CompanyScopeGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  create(@CurrentCompany() companyId: string, @Body() dto: CreateProductDto) {
    return this.productsService.create(companyId, dto);
  }

  @Get()
  findAll(
    @CurrentCompany() companyId: string,
    @Query() query: QueryProductDto,
  ) {
    return this.productsService.findAll(companyId, query);
  }

  @Get('stats')
  getStats(@CurrentCompany() companyId: string) {
    return this.productsService.getStats(companyId);
  }

  @Get('alerts')
  getAlerts(@CurrentCompany() companyId: string) {
    return this.productsService.getAlerts(companyId);
  }

  @Get(':id')
  findOne(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.productsService.findOne(companyId, id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(companyId, id, dto);
  }

  @Delete('bulk')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  removeMany(@CurrentCompany() companyId: string, @Body('ids') ids: string[]) {
    return this.productsService.removeMany(companyId, ids);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.productsService.remove(companyId, id);
  }
}
