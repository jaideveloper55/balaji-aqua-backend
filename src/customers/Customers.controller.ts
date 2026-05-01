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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import {
  QueryCustomerDto,
  UpdateCustomerDto,
} from './dto/Update query customer.dto';
import { QueryLedgerDto } from './dto/query-ledger.dto';
import { CreateLedgerEntryDto } from './dto/customer-ledger.dto';
import {
  CreateCustomerPricingDto,
  UpdateCustomerPricingDto,
} from './dto/customer-pricing.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

import { Roles } from '../common/decorators/roles.decorator';
import { CompanyScopeGuard } from 'src/common/guards/company-scope.guard';
import { CurrentCompany } from 'src/common/guards/current-company.decorator';

@ApiTags('Customers')
@ApiBearerAuth('JWT-auth')
@ApiHeader({
  name: 'X-Company-Id',
  description: 'Active company UUID (from TenantSelector in frontend)',
  required: true,
})
@UseGuards(JwtAuthGuard, RolesGuard, CompanyScopeGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // ─── CUSTOMERS CRUD ────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 409, description: 'Phone number already exists' })
  create(@Body() dto: CreateCustomerDto, @CurrentCompany() companyId: string) {
    return this.customersService.create(dto, companyId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List customers with filters' })
  findAll(
    @Query() query: QueryCustomerDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.customersService.findAll(companyId, query);
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get customer statistics' })
  getStats(@CurrentCompany() companyId: string) {
    return this.customersService.getStats(companyId);
  }

  @Get('export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Export customers' })
  export(
    @Query() query: QueryCustomerDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.customersService.exportCustomers(companyId, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get customer by ID' })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.customersService.findOne(id, companyId);
  }

  @Get(':id/detail')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get customer detail with summary cards' })
  findDetail(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.customersService.findDetail(id, companyId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update customer' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.customersService.update(id, dto, companyId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete customer' })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.customersService.remove(id, companyId);
  }

  // ─── PRICING ───────────────────────────────────────────────────────────────

  @Get(':id/pricing')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get customer pricing rules' })
  getPricing(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.customersService.getPricing(id, companyId);
  }

  @Post(':id/pricing')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Add customer price rule' })
  addPricing(
    @Param('id') id: string,
    @Body() dto: CreateCustomerPricingDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.customersService.addPricing(id, dto, companyId);
  }

  @Patch(':id/pricing/:pricingId')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update price rule' })
  updatePricing(
    @Param('id') id: string,
    @Param('pricingId') pricingId: string,
    @Body() dto: UpdateCustomerPricingDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.customersService.updatePricing(id, pricingId, dto, companyId);
  }

  @Delete(':id/pricing/:pricingId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete price rule' })
  deletePricing(
    @Param('id') id: string,
    @Param('pricingId') pricingId: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.customersService.deletePricing(id, pricingId, companyId);
  }

  // ─── LEDGER ────────────────────────────────────────────────────────────────

  @Get(':id/ledger')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get customer ledger' })
  getLedger(
    @Param('id') id: string,
    @Query() query: QueryLedgerDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.customersService.getLedger(id, companyId, query);
  }

  @Post(':id/ledger')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Add ledger entry' })
  addLedgerEntry(
    @Param('id') id: string,
    @Body() dto: CreateLedgerEntryDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.customersService.addLedgerEntry(id, dto, companyId);
  }

  @Get(':id/ledger/export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Export ledger' })
  exportLedger(
    @Param('id') id: string,
    @Query() query: QueryLedgerDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.customersService.exportLedger(id, companyId, query);
  }
}
