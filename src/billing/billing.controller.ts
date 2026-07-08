import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
  ApiSecurity,
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import {
  CreateInvoiceDto,
  CreatePaymentDto,
  InvoiceFilterDto,
  PaymentFilterDto,
  OutstandingFilterDto,
  UpdateInvoiceDto,
  DailySummaryFilterDto,
} from './dto/billing.dto';

import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CompanyScopeGuard } from 'src/common/guards/company-scope.guard';
import { CurrentCompany } from 'src/common/guards/current-company.decorator';

interface JwtUser {
  sub: string;
  role: Role;
}

@ApiTags('Billing & POS')
@ApiBearerAuth()
@ApiSecurity('X-Company-Id')
@UseGuards(JwtAuthGuard, CompanyScopeGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // ──────────────────────────────────────────────────────────────────────
  // POS ENDPOINTS
  // ──────────────────────────────────────────────────────────────────────

  @Get('pos/products')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Get products for POS grid',
    description:
      'Returns active, in-stock products for the Quick Billing product grid. Supports search by name or SKU.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name or SKU',
  })
  async getPOSProducts(
    @CurrentCompany() companyId: string,
    @Query('search') search?: string,
  ) {
    return this.billingService.getPOSProducts(companyId, search);
  }

  @Get('pos/customer-price/:customerId/:productId')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Get effective price for customer + product',
    description: 'Returns custom price if set, otherwise base product price.',
  })
  async getCustomerPrice(
    @Param('customerId') customerId: string,
    @Param('productId') productId: string,
    @CurrentCompany() companyId: string,
  ) {
    const price = await this.billingService.getCustomerPrice(
      customerId,
      productId,
      companyId,
    );
    return { price };
  }

  // ──────────────────────────────────────────────────────────────────────
  // INVOICE ENDPOINTS
  // ──────────────────────────────────────────────────────────────────────

  @Post('invoices')
  @Roles(Role.ADMIN, Role.STAFF)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new invoice',
    description:
      'Creates invoice with line items. Automatically reduces stock and updates customer outstanding balance.',
  })
  @ApiResponse({ status: 201, description: 'Invoice created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation error (missing customer, invalid products, etc.)',
  })
  async createInvoice(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: JwtUser,
    @CurrentCompany() companyId: string,
  ) {
    return this.billingService.createInvoice(dto, companyId, user.sub);
  }

  @Get('invoices')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'List invoices with filters',
    description:
      'Paginated invoice list. Filter by status, customer, date range, or search by invoice number.',
  })
  async findAllInvoices(
    @Query() filters: InvoiceFilterDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.billingService.findAllInvoices(filters, companyId);
  }

  @Get('invoices/:id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get invoice by ID with full details' })
  async findInvoice(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.billingService.findInvoiceById(id, companyId);
  }

  @Patch('invoices/:id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update invoice notes or due date' })
  async updateInvoice(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.billingService.updateInvoice(id, dto, companyId);
  }

  @Patch('invoices/:id/cancel')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Cancel an invoice',
    description:
      'Cancels a confirmed/partial invoice. Restores stock and reverses customer outstanding. Cannot cancel PAID invoices.',
  })
  async cancelInvoice(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.billingService.cancelInvoice(id, companyId);
  }

  // ──────────────────────────────────────────────────────────────────────
  // PAYMENT ENDPOINTS
  // ──────────────────────────────────────────────────────────────────────

  @Post('payments')
  @Roles(Role.ADMIN, Role.STAFF)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record a payment',
    description:
      'Records payment against a specific invoice or overall outstanding. Updates customer ledger.',
  })
  @ApiResponse({ status: 201, description: 'Payment recorded successfully' })
  @ApiResponse({
    status: 400,
    description: 'Payment exceeds balance due / invalid invoice',
  })
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: JwtUser,
    @CurrentCompany() companyId: string,
  ) {
    return this.billingService.createPayment(dto, companyId, user.sub);
  }

  @Get('payments')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: "List payments with today's summary",
    description:
      "Returns paginated payments list + today's Cash/UPI/Bank breakdown (for dashboard cards). Supports paymentMode, customerId, dateFrom and dateTo filters.",
  })
  async findAllPayments(
    @Query() filters: PaymentFilterDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.billingService.findAllPayments(filters, companyId);
  }

  // ──────────────────────────────────────────────────────────────────────
  // OUTSTANDING
  // ──────────────────────────────────────────────────────────────────────

  @Get('outstanding')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Get outstanding dues',
    description:
      'Returns customers with pending payments. Includes risk classification (HIGH >15d, MEDIUM 7-15d, RECENT <7d). Supports search (name/code/phone) and sortBy (risk/amount/days/lastPaid).',
  })
  @ApiQuery({
    name: 'risk',
    required: false,
    enum: ['HIGH', 'MEDIUM', 'RECENT'],
    description: 'Filter by risk level',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, customerCode, or phone',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['risk', 'amount', 'days', 'lastPaid'],
    description: 'Sort order (default: risk)',
  })
  async getOutstanding(
    @Query() filters: OutstandingFilterDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.billingService.getOutstanding(filters, companyId);
  }

  @Get('daily-summary')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Get daily / range billing summary',
    description:
      'Returns aggregated stats for a single day (via `date`) or a date range (via `dateFrom` + `dateTo`). Defaults to today if nothing is provided.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description:
      'Single date (YYYY-MM-DD). Ignored if dateFrom/dateTo are provided.',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Range start (YYYY-MM-DD). Use with dateTo.',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'Range end (YYYY-MM-DD). Use with dateFrom.',
  })
  async getDailySummary(
    @Query() filters: DailySummaryFilterDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.billingService.getDailySummary(companyId, filters);
  }
}
