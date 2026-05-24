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

import { CompanyScopeGuard } from '../common/guards/company-scope.guard';

import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentCompany } from 'src/common/guards/current-company.decorator';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  create(@CurrentCompany() companyId: string, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(companyId, dto);
  }

  @Get()
  findAll(@CurrentCompany() companyId: string) {
    return this.categoriesService.findAll(companyId);
  }

  @Get(':id')
  findOne(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.categoriesService.findOne(companyId, id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.categoriesService.remove(companyId, id);
  }
}
