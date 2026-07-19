import {
  Controller,
  Get,
  Post,
  Body,
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
import { PettyCashService } from './petty-cash.service';
import { AddCashDto } from './dto/add-cash.dto';
import { SpendCashDto } from './dto/spend-cash.dto';
import { QueryPettyCashDto } from './dto/query-petty-cash.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Petty Cash')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('petty-cash')
export class PettyCashController {
  constructor(private readonly pettyCashService: PettyCashService) {}

  @Get('balance')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Current cash balance + today activity' })
  getBalance(@Req() req: any) {
    return this.pettyCashService.getBalance(req.user.companyId);
  }

  @Get('transactions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Cash movement log' })
  getTransactions(@Req() req: any, @Query() query: QueryPettyCashDto) {
    return this.pettyCashService.getTransactions(req.user.companyId, query);
  }

  @Post('add')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Add cash to box (top-up)' })
  @ApiResponse({ status: 201, description: 'Cash added' })
  addCash(@Req() req: any, @Body() dto: AddCashDto) {
    return this.pettyCashService.addCash(req.user.companyId, dto);
  }

  @Post('spend')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Record a cash expense' })
  @ApiResponse({ status: 201, description: 'Expense recorded' })
  spendCash(@Req() req: any, @Body() dto: SpendCashDto) {
    return this.pettyCashService.spendCash(req.user.companyId, dto);
  }

  @Post('reconcile')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconcile petty cash' })
  reconcile(@Req() req: any) {
    return this.pettyCashService.reconcile(req.user.companyId);
  }
}
