import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CurrentCompany } from '../guards/current-company.decorator';
import { InventoryService } from 'src/inventory/Inventory.service';
import {
  MovementHistoryQueryDto,
  StockListQueryDto,
} from 'src/inventory/dto/Query.dto';
import { StockInDto } from 'src/inventory/dto/Stock in.dto';
import { StockOutDto } from 'src/inventory/dto/Stock out.dto';
import { AdjustStockDto } from 'src/inventory/dto/Adjust stock.dto';

@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('summary')
  getSummary(@CurrentCompany() companyId: string) {
    return this.inventoryService.getSummary(companyId);
  }

  @Get('stock')
  getStockList(
    @Query() query: StockListQueryDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.inventoryService.getStockList(query, companyId);
  }

  @Get('low-stock')
  getLowStockAlerts(@CurrentCompany() companyId: string) {
    return this.inventoryService.getLowStockAlerts(companyId);
  }

  @Get('movements')
  getMovementHistory(
    @Query() query: MovementHistoryQueryDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.inventoryService.getMovementHistory(query, companyId);
  }

  @Post('stock-in')
  stockIn(
    @Body() dto: StockInDto,
    @CurrentCompany() companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.inventoryService.stockIn(dto, companyId, userId);
  }

  @Post('stock-out')
  stockOut(
    @Body() dto: StockOutDto,
    @CurrentCompany() companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.inventoryService.stockOut(dto, companyId, userId);
  }

  @Post('adjust')
  adjust(
    @Body() dto: AdjustStockDto,
    @CurrentCompany() companyId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.inventoryService.adjust(dto, companyId, userId);
  }
}
