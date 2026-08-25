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
import type { JwtPayload } from '../common/decorators/current-user.decorator';

interface JwtAuthUser {
  sub: string;
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
    @CurrentCompany() companyId: string,
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

  // ─── DELETE (SUPER_ADMIN only, hard delete) ───────────────────────────
  // This is the ONLY delete route on this controller. A previous version
  // had a second `@Delete(':id')` (a leftover `remove()` handler open to
  // ADMIN as well as SUPER_ADMIN) sitting on the exact same path — NestJS
  // silently only ever runs the first-registered handler for a duplicate
  // route, so that second one was permanently dead code, and worse, the
  // FIRST one (the ADMIN-permissive one) was the one actually executing on
  // every request. Do not add a second delete route back here.
  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Hard delete an event order (SUPER_ADMIN only)',
    description:
      'Permanently removes the event, its items, and all payments recorded against it. Releases any reserved stock the event was still holding.',
  })
  @ApiResponse({ status: 200, description: 'Event deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Only SUPER_ADMIN can delete events',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  deleteEventOrder(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @CurrentCompany() companyId: string,
  ) {
    return this.eventOrdersService.deleteEventOrder(id, companyId, user.sub);
  }
}
