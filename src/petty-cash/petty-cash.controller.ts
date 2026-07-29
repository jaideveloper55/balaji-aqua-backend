import {
  Controller,
  Get,
  Post,
  Patch,
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
  @ApiOperation({ summary: 'Get current petty cash balance + today activity' })
  @ApiResponse({ status: 200, description: 'Balance returned' })
  getBalance(@Req() req: any) {
    return this.pettyCashService.getBalance(req.user.companyIds[0]);
  }

  @Get('transactions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get petty cash transaction log' })
  @ApiResponse({ status: 200, description: 'Transactions returned' })
  getTransactions(@Req() req: any, @Query() query: QueryPettyCashDto) {
    return this.pettyCashService.getTransactions(req.user.companyIds[0], query);
  }

  @Post('add')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add cash to petty cash box (IN)' })
  @ApiResponse({ status: 201, description: 'Cash added, balance updated' })
  addCash(@Req() req: any, @Body() dto: AddCashDto) {
    return this.pettyCashService.addCash(req.user.companyIds[0], dto);
  }

  @Post('spend')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Spend cash from petty cash box (OUT)' })
  @ApiResponse({
    status: 201,
    description: 'Expense recorded, balance updated',
  })
  @ApiResponse({ status: 400, description: 'Insufficient cash balance' })
  spendCash(@Req() req: any, @Body() dto: SpendCashDto) {
    return this.pettyCashService.spendCash(req.user.companyIds[0], dto);
  }

  @Patch('reconcile')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconcile all petty cash transactions up to now' })
  @ApiResponse({ status: 200, description: '{ message, reconciledTill }' })
  reconcile(@Req() req: any) {
    return this.pettyCashService.reconcile(req.user.companyIds[0]);
  }
}
