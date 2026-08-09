// src/event-orders/event-orders.controller.ts
//
// PATTERN CHANGE: match the Customers module pattern exactly.
//
// BEFORE (broken):
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   user.companyId  ← undefined (JWT has companyIds[], not companyId)
//   user.userId     ← undefined (JWT has sub, not userId)
//
// AFTER (correct — same as CustomersController):
//   @UseGuards(JwtAuthGuard, RolesGuard, CompanyScopeGuard)
//   @CurrentCompany() companyId  ← reads X-Company-Id header (guaranteed string)
//   @CurrentUser() user          ← reads JWT, use user.sub as userId
//
// WHY X-Company-Id header instead of JWT companyId:
//   A user can belong to multiple companies (multi-tenant SaaS).
//   The JWT holds companyIds[] (all their companies).
//   The frontend sends X-Company-Id header to say "I'm operating as THIS company now."
//   CompanyScopeGuard validates that X-Company-Id is in the user's companyIds[].
//   This is safer than trusting user.companyIds[0] which could be wrong
//   if the user switches companies.
//
// FRONTEND CHANGE NEEDED:
//   Every API call to /event-orders must include the header:
//   'X-Company-Id': '<active company UUID>'
//   Your authAxios instance should already set this if Customers module works.
//   Check your axios interceptor — it likely adds X-Company-Id from localStorage/store.

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  ApiHeader,
  ApiResponse,
} from '@nestjs/swagger';
import { EventOrdersService } from './event-orders.service';
import { CreateEventOrderDto } from './dto/create-event-order.dto';
import { UpdateEventOrderDto } from './dto/update-event-order.dto';
import { QueryEventOrdersDto } from './dto/query-event-orders.dto';
import { CancelEventOrderDto } from './dto/cancel-event-order.dto';
import { RecordEventPaymentDto } from './dto/record-payment.dto';
import { Role, EventOrderStatus } from '@prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CompanyScopeGuard } from 'src/common/guards/company-scope.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CurrentCompany } from 'src/common/guards/current-company.decorator';

// JwtPayload shape — matches current-user.decorator.ts exactly
interface JwtAuthUser {
  sub: string; // userId
  email: string;
  role: Role;
  companyIds: string[];
  firstName: string;
  lastName: string;
}

@ApiTags('Event Orders')
@ApiBearerAuth('JWT-auth')
@ApiHeader({
  name: 'X-Company-Id',
  description: 'Active company UUID (from TenantSelector in frontend)',
  required: true,
})
// FIXED: added CompanyScopeGuard — same as CustomersController
@UseGuards(JwtAuthGuard, RolesGuard, CompanyScopeGuard)
@Controller('event-orders')
export class EventOrdersController {
  constructor(private readonly eventOrdersService: EventOrdersService) {}

  // ─── CREATE ────────────────────────────────────────────────────────────
  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new event/function order' })
  @ApiResponse({ status: 201, description: 'Event order created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or insufficient stock',
  })
  create(
    @Body() dto: CreateEventOrderDto,
    @CurrentCompany() companyId: string, // ← from X-Company-Id header
    @CurrentUser() user: JwtAuthUser,
  ) {
    return this.eventOrdersService.create(dto, companyId, user.sub);
  }

  // ─── LIST ──────────────────────────────────────────────────────────────
  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Get all event orders (with filters and pagination)',
  })
  findAll(
    @Query() query: QueryEventOrdersDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.eventOrdersService.findAll(query, companyId);
  }

  // ─── STATS ─────────────────────────────────────────────────────────────
  @Get('stats')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get dashboard statistics for event orders' })
  getStats(@CurrentCompany() companyId: string) {
    return this.eventOrdersService.getStats(companyId);
  }

  // ─── GET ONE ───────────────────────────────────────────────────────────
  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get one event order by ID' })
  @ApiResponse({ status: 404, description: 'Event order not found' })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.eventOrdersService.findOne(id, companyId);
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────
  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update event order (basic fields — not items)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventOrderDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.eventOrdersService.update(id, dto, companyId);
  }

  // ─── UPDATE STATUS ─────────────────────────────────────────────────────
  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary:
      'Update event status (CONFIRMED → IN_PROGRESS → DELIVERED → COMPLETED)',
  })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: EventOrderStatus,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: JwtAuthUser,
  ) {
    return this.eventOrdersService.updateStatus(
      id,
      status,
      companyId,
      user.sub,
    );
  }

  // ─── CANCEL ────────────────────────────────────────────────────────────
  @Post(':id/cancel')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Cancel an event order (releases reserved stock)' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEventOrderDto,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: JwtAuthUser,
  ) {
    return this.eventOrdersService.cancel(id, dto, companyId, user.sub);
  }

  // ─── RECORD PAYMENT ────────────────────────────────────────────────────
  @Post(':id/payments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a payment against an event order' })
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordEventPaymentDto,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: JwtAuthUser,
  ) {
    return this.eventOrdersService.recordPayment(id, dto, companyId, user.sub);
  }

  // ─── DELETE ────────────────────────────────────────────────────────────
  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a DRAFT event order' })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.eventOrdersService.remove(id, companyId);
  }
}
