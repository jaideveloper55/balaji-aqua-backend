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
import { RecurringService } from './recurring.service';
import { CreateRecurringDto } from './dto/create-recurring.dto';
import { UpdateRecurringDto } from './dto/update-recurring.dto';
import { QueryRecurringDto } from './dto/query-recurring.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Recurring Expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('recurring-expenses')
export class RecurringController {
  constructor(private readonly recurringService: RecurringService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create a recurring schedule' })
  @ApiResponse({ status: 201, description: 'Schedule created' })
  create(@Req() req: any, @Body() dto: CreateRecurringDto) {
    return this.recurringService.create(req.user.companyIds[0], dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List recurring schedules' })
  findAll(@Req() req: any, @Query() query: QueryRecurringDto) {
    return this.recurringService.findAll(req.user.companyIds[0], query);
  }

  @Get('stats')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Recurring summary stats' })
  getStats(@Req() req: any) {
    return this.recurringService.getStats(req.user.companyIds[0]);
  }

  @Get('reminders')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Active due-date reminders (tiered by urgency, unacknowledged)',
  })
  getReminders(@Req() req: any) {
    return this.recurringService.getReminders(req.user.companyIds[0]);
  }

  @Patch(':id/acknowledge')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Acknowledge a reminder (stops it for this cycle)' })
  acknowledge(@Req() req: any, @Param('id') id: string) {
    return this.recurringService.acknowledge(req.user.companyIds[0], id);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get one schedule' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.recurringService.findOne(req.user.companyIds[0], id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update a schedule' })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateRecurringDto,
  ) {
    return this.recurringService.update(req.user.companyIds[0], id, dto);
  }

  @Patch(':id/toggle-pause')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Pause / resume a schedule' })
  togglePause(@Req() req: any, @Param('id') id: string) {
    return this.recurringService.togglePause(req.user.companyIds[0], id);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a schedule' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.recurringService.remove(req.user.companyIds[0], id);
  }
}