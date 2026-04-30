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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
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

@ApiTags('Customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth') // ← fixed name
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.STAFF) // ← enum not string
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 409, description: 'Phone number already exists' })
  async create(@Body() dto: CreateCustomerDto, @CurrentUser() user: any) {
    return this.customersService.create(dto, user.companyId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get all customers with filters' })
  async findAll(@Query() query: QueryCustomerDto, @CurrentUser() user: any) {
    return this.customersService.findAll(user.companyId, query);
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get customer statistics' })
  async getStats(@CurrentUser() user: any) {
    return this.customersService.getStats(user.companyId);
  }

  @Get('export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Export customers' })
  async export(@Query() query: QueryCustomerDto, @CurrentUser() user: any) {
    return this.customersService.exportCustomers(user.companyId, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get customer by ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customersService.findOne(id, user.companyId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update customer' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.update(id, dto, user.companyId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete customer' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customersService.remove(id, user.companyId);
  }

  @Get(':id/pricing')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get customer pricing rules' })
  async getPricing(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customersService.getPricing(id, user.companyId);
  }

  @Post(':id/pricing')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Add customer price rule' })
  async addPricing(
    @Param('id') id: string,
    @Body() dto: CreateCustomerPricingDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.addPricing(id, dto, user.companyId);
  }

  @Patch(':id/pricing/:pricingId')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update price rule' })
  async updatePricing(
    @Param('id') id: string,
    @Param('pricingId') pricingId: string,
    @Body() dto: UpdateCustomerPricingDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.updatePricing(
      id,
      pricingId,
      dto,
      user.companyId,
    );
  }

  @Delete(':id/pricing/:pricingId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete price rule' })
  async deletePricing(
    @Param('id') id: string,
    @Param('pricingId') pricingId: string,
    @CurrentUser() user: any,
  ) {
    return this.customersService.deletePricing(id, pricingId, user.companyId);
  }

  @Get(':id/ledger')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get customer ledger' })
  async getLedger(
    @Param('id') id: string,
    @Query() query: QueryLedgerDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.getLedger(id, user.companyId, query);
  }

  @Post(':id/ledger')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Add ledger entry' })
  async addLedgerEntry(
    @Param('id') id: string,
    @Body() dto: CreateLedgerEntryDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.addLedgerEntry(id, dto, user.companyId);
  }

  @Get(':id/ledger/export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Export ledger' })
  async exportLedger(
    @Param('id') id: string,
    @Query() query: QueryLedgerDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.exportLedger(id, user.companyId, query);
  }
}
