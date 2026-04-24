import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Companies')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // ─── POST /companies ───────────────────────────────────────────────────────
  // SUPER_ADMIN only — creates new company
  @Post()
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new company (SUPER_ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Company created.' })
  @ApiResponse({ status: 409, description: 'Email or GST already exists.' })
  @ApiResponse({ status: 403, description: 'SUPER_ADMIN only.' })
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  // ─── GET /companies ────────────────────────────────────────────────────────
  // SUPER_ADMIN → all companies
  // ADMIN → only their company
  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List companies — SUPER_ADMIN sees all, ADMIN sees own',
  })
  @ApiResponse({ status: 200, description: 'List of companies.' })
  findAll(@CurrentUser() user: JwtPayload) {
    // SUPER_ADMIN gets all, ADMIN gets only their company
    const companyId =
      user.role === Role.SUPER_ADMIN ? undefined : user.companyId;
    return this.companiesService.findAll(companyId);
  }

  // ─── GET /companies/:id ────────────────────────────────────────────────────
  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get company by ID' })
  @ApiResponse({ status: 200, description: 'Company details.' })
  @ApiResponse({ status: 404, description: 'Company not found.' })
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  // ─── PATCH /companies/:id ──────────────────────────────────────────────────
  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update company details' })
  @ApiResponse({ status: 200, description: 'Company updated.' })
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  // ─── DELETE /companies/:id ─────────────────────────────────────────────────
  // Soft delete — sets isActive: false
  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate company (SUPER_ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Company deactivated.' })
  deactivate(@Param('id') id: string) {
    return this.companiesService.deactivate(id);
  }
}
