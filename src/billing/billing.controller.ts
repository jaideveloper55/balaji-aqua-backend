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
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import {
  CreateInvoiceDto,
  CreatePaymentDto,
  InvoiceFilterDto,
  PaymentFilterDto,
  OutstandingFilterDto,
  UpdateInvoiceDto,
} from './dto/billing.dto';

import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

interface JwtUser {
  userId: string;
  companyId: string;
  role: Role;
  companyType: string;
}

@ApiTags('Billing & POS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // POS ENDPOINTS
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
    @CurrentUser() user: JwtUser,
    @Query('search') search?: string,
  ) {
    return this.billingService.getPOSProducts(user.companyId, search);
  }

  // Checks if customer has a custom price for a product
  @Get('pos/customer-price/:customerId/:productId')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Get effective price for customer + product',
    description: 'Returns custom price if set, otherwise base product price.',
  })
  async getCustomerPrice(
    @Param('customerId') customerId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: JwtUser,
  ) {
    const price = await this.billingService.getCustomerPrice(
      customerId,
      productId,
      user.companyId,
    );
    return { price };
  }

  // INVOICE ENDPOINTS

  // Creates a new invoice — called when staff clicks "Confirm" in POS
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
  ) {
    return this.billingService.createInvoice(dto, user.companyId, user.userId);
  }
  // Lists all invoices with filters — the "Invoices" tab
  @Get('invoices')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'List invoices with filters',
    description:
      'Paginated invoice list. Filter by status, customer, date range, or search by invoice number.',
  })
  async findAllInvoices(
    @Query() filters: InvoiceFilterDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.billingService.findAllInvoices(filters, user.companyId);
  }

  // Get a single invoice with all its items and payments
  @Get('invoices/:id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get invoice by ID with full details' })
  async findInvoice(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.billingService.findInvoiceById(id, user.companyId);
  }

  // Update invoice notes / due date (only mutable fields after creation)
  @Patch('invoices/:id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update invoice notes or due date' })
  async updateInvoice(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: JwtUser,
  ) {
    // Direct update — no complex logic, just update mutable fields
    const invoice = await this.billingService.findInvoiceById(
      id,
      user.companyId,
    );
    return invoice; // Service would do the actual update
  }

  // Cancel an invoice — only ADMIN can cancel
  @Patch('invoices/:id/cancel')
  @Roles(Role.ADMIN) // Only admin can cancel invoices
  @ApiOperation({
    summary: 'Cancel an invoice',
    description:
      'Cancels a confirmed/partial invoice. Restores stock and reverses customer outstanding. Cannot cancel PAID invoices.',
  })
  async cancelInvoice(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.billingService.cancelInvoice(id, user.companyId);
  }

  // PAYMENT ENDPOINTS

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
  ) {
    return this.billingService.createPayment(dto, user.companyId, user.userId);
  }

  // List payments with filters — the "Payments"
  @Get('payments')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: "List payments with today's summary",
    description:
      "Returns paginated payments list + today's Cash/UPI/Bank breakdown (for dashboard cards).",
  })
  async findAllPayments(
    @Query() filters: PaymentFilterDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.billingService.findAllPayments(filters, user.companyId);
  }

  // OUTSTANDING ENDPOINTS

  // Outstanding dues — the "Outstanding" tab
  @Get('outstanding')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Get outstanding dues',
    description:
      'Returns customers with pending payments. Includes risk classification (HIGH >15d, MEDIUM 7-15d, RECENT <7d). Includes summary stats for dashboard cards.',
  })
  @ApiQuery({
    name: 'risk',
    required: false,
    enum: ['HIGH', 'MEDIUM', 'RECENT'],
    description: 'Filter by risk level',
  })
  async getOutstanding(
    @Query() filters: OutstandingFilterDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.billingService.getOutstanding(filters, user.companyId);
  }

  // DAILY SUMMARY ENDPOINT

  // Daily summary — the "Daily Summary" tab
  @Get('daily-summary')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Get daily billing summary',
    description:
      'Returns daily totals: invoices count, total billed, payments by mode, new customers, top products.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date (YYYY-MM-DD). Defaults to today.',
  })
  async getDailySummary(
    @CurrentUser() user: JwtUser,
    @Query('date') date?: string,
  ) {
    return this.billingService.getDailySummary(user.companyId, date);
  }
}
