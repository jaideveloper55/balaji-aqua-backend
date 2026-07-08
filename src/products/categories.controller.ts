import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentCompany } from 'src/common/guards/current-company.decorator';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
@ApiTags('Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Create a new product category' })
  create(@CurrentCompany() companyId: string, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(companyId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List all categories with product counts' })
  findAll(@CurrentCompany() companyId: string) {
    return this.categoriesService.findAll(companyId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get a single category by ID' })
  findOne(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.categoriesService.findOne(companyId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update a category' })
  update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Delete a category (must have zero linked products)',
  })
  remove(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.categoriesService.remove(companyId, id);
  }
}
