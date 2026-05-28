import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiSecurity,
  ApiProduces,
} from '@nestjs/swagger';
import { ExportService } from './export.service';
import { ExportFilterDto } from './dto/export.dto';

import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CompanyScopeGuard } from 'src/common/guards/company-scope.guard';
import { CurrentCompany } from 'src/common/guards/current-company.decorator';

@ApiTags('Billing Exports')
@ApiBearerAuth()
@ApiSecurity('X-Company-Id')
@UseGuards(JwtAuthGuard, CompanyScopeGuard, RolesGuard)
@Controller('billing/export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  // ─── HELPER: Stream a generated file as a download ───────────────────────
  private sendFile(
    res: Response,
    file: { buffer: Buffer; filename: string; mimeType: string },
  ) {
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.setHeader('Content-Length', file.buffer.length.toString());
    res.send(file.buffer);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. INVOICES EXPORT
  // ─────────────────────────────────────────────────────────────────────────
  @Get('invoices')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Export invoices as CSV or PDF',
    description:
      'Returns ALL invoices matching the date range (not paginated). Capped at 10,000 rows for safety; narrow the range if you hit the cap.',
  })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-05-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-05-31' })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'pdf'] })
  @ApiProduces('text/csv', 'application/pdf')
  async exportInvoices(
    @Query() filters: ExportFilterDto,
    @CurrentCompany() companyId: string,
    @Res() res: Response,
  ) {
    const file = await this.exportService.exportInvoices(filters, companyId);
    this.sendFile(res, file);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. PAYMENTS EXPORT
  // ─────────────────────────────────────────────────────────────────────────
  @Get('payments')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Export payments as CSV or PDF',
    description:
      'Returns ALL payments matching the date range (not paginated). Capped at 10,000 rows.',
  })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-05-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-05-31' })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'pdf'] })
  @ApiProduces('text/csv', 'application/pdf')
  async exportPayments(
    @Query() filters: ExportFilterDto,
    @CurrentCompany() companyId: string,
    @Res() res: Response,
  ) {
    const file = await this.exportService.exportPayments(filters, companyId);
    this.sendFile(res, file);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. OUTSTANDING EXPORT
  // ─────────────────────────────────────────────────────────────────────────
  @Get('outstanding')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Export outstanding dues as CSV or PDF',
    description:
      'Returns all active customers with outstanding > 0, with computed overdue days and risk classification.',
  })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'pdf'] })
  @ApiProduces('text/csv', 'application/pdf')
  async exportOutstanding(
    @Query() filters: ExportFilterDto,
    @CurrentCompany() companyId: string,
    @Res() res: Response,
  ) {
    const file = await this.exportService.exportOutstanding(filters, companyId);
    this.sendFile(res, file);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. DAILY SUMMARY EXPORT
  // ─────────────────────────────────────────────────────────────────────────
  @Get('daily-summary')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Export daily/range summary as CSV or PDF',
    description:
      'Single-row aggregate report. Defaults to today if no date range given.',
  })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-05-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-05-31' })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'pdf'] })
  @ApiProduces('text/csv', 'application/pdf')
  async exportDailySummary(
    @Query() filters: ExportFilterDto,
    @CurrentCompany() companyId: string,
    @Res() res: Response,
  ) {
    const file = await this.exportService.exportDailySummary(
      filters,
      companyId,
    );
    this.sendFile(res, file);
  }
}
