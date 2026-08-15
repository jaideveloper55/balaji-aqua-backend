import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { DashboardService } from './dashboard.service';
import {
  DashboardSummaryDto,
  DashboardSummaryQueryDto,
} from './dto/dashboard-summary.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get dashboard summary',
    description:
      'Returns KPIs, payment split, outstanding-by-risk, top due customers, ' +
      'and stock levels — all filtered to the logged-in company. Optional ' +
      'dateFrom/dateTo scope the collection/billing figures to a period; ' +
      'omit both for the live "today" view.',
  })
  @ApiOkResponse({ type: DashboardSummaryDto })
  async getSummary(
    @CurrentUser() user: { companyId: string },
    @Query() query: DashboardSummaryQueryDto,
  ): Promise<DashboardSummaryDto> {
    return this.dashboardService.getSummary(
      user.companyId,
      query.dateFrom,
      query.dateTo,
    );
  }
}
