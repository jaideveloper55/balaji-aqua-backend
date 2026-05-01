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
  // SUPER_ADMIN only.
  // Note: Normally companies are seeded in prisma/seed.ts. This endpoint
  // exists only for future expansion (e.g. friend opens a 3rd business).
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
  // SUPER_ADMIN → all companies in the system
  // ADMIN       → only companies they have access to (via UserCompany)
  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List companies — SUPER_ADMIN sees all, ADMIN sees their own',
  })
  @ApiResponse({ status: 200, description: 'List of companies.' })
  findAll(@CurrentUser() user: JwtPayload) {
    // CHANGED: companyIds[] (array) instead of single companyId
    // SUPER_ADMIN passes undefined → service returns ALL companies
    // ADMIN passes their accessible companyIds → service filters by them
    const companyIds =
      user.role === Role.SUPER_ADMIN ? undefined : user.companyIds;
    return this.companiesService.findAll(companyIds);
  }

  // ─── GET /companies/:id ────────────────────────────────────────────────────
  // ADMIN can only view companies they have access to
  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get company by ID' })
  @ApiResponse({ status: 200, description: 'Company details.' })
  @ApiResponse({ status: 403, description: 'No access to this company.' })
  @ApiResponse({ status: 404, description: 'Company not found.' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    // SUPER_ADMIN can view anything; ADMIN restricted to assigned companies
    return this.companiesService.findOne(id, user);
  }

  // ─── PATCH /companies/:id ──────────────────────────────────────────────────
  // ADMIN can edit companies they're assigned to; SUPER_ADMIN edits any
  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update company details' })
  @ApiResponse({ status: 200, description: 'Company updated.' })
  @ApiResponse({ status: 403, description: 'No access to this company.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.companiesService.update(id, dto, user);
  }

  // ─── DELETE /companies/:id ─────────────────────────────────────────────────
  // Soft delete — sets isActive: false (preserves all historical data)
  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate company (SUPER_ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Company deactivated.' })
  deactivate(@Param('id') id: string) {
    return this.companiesService.deactivate(id);
  }
}
