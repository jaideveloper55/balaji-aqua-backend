import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

// WHY companyIds[0]:
// jwt.strategy.ts validate() returns companyIds[] (array) not companyId (string)
// because the system supports multi-company users.

@ApiTags('Expense Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expense-categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create an expense category (with budget)' })
  @ApiResponse({ status: 201, description: 'Category created' })
  create(@Req() req: any, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(req.user.companyIds[0], dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List categories with budget usage' })
  findAll(@Req() req: any, @Query() query: QueryCategoryDto) {
    return this.categoriesService.findAll(req.user.companyIds[0], query);
  }

  @Get('overview')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Monthly budget overview' })
  getOverview(@Req() req: any) {
    return this.categoriesService.getBudgetOverview(req.user.companyIds[0]);
  }

  @Get('simple')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Simple list for dropdowns' })
  listSimple(@Req() req: any) {
    return this.categoriesService.listSimple(req.user.companyIds[0]);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get one category' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.categoriesService.findOne(req.user.companyIds[0], id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update category / budget' })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(req.user.companyIds[0], id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete category (if no expenses linked)' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.categoriesService.remove(req.user.companyIds[0], id);
  }
}
