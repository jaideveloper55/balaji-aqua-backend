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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { VendorsService } from './Vendors.service';
import { CreateVendorDto } from './dto/Create vendor.dto';
import { QueryVendorDto } from './dto/Query vendor.dto';
import { UpdateVendorDto } from './dto/Update vendor.dto';

@ApiTags('Vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create a vendor' })
  @ApiResponse({ status: 201, description: 'Vendor created' })
  create(@Req() req: any, @Body() dto: CreateVendorDto) {
    return this.vendorsService.create(req.user.companyIds[0], dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List vendors with paid YTD & outstanding' })
  findAll(@Req() req: any, @Query() query: QueryVendorDto) {
    return this.vendorsService.findAll(req.user.companyIds[0], query);
  }

  @Get('stats')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Vendor summary stats' })
  getStats(@Req() req: any) {
    return this.vendorsService.getStats(req.user.companyIds[0]);
  }

  @Get('simple')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Simple list for dropdowns' })
  listSimple(@Req() req: any) {
    return this.vendorsService.listSimple(req.user.companyIds[0]);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get one vendor' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.findOne(req.user.companyIds[0], id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update a vendor' })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorsService.update(req.user.companyIds[0], id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a vendor' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.remove(req.user.companyIds[0], id);
  }
}
