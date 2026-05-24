import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiSecurity,
} from '@nestjs/swagger';
import { CartService } from './cart.service';
import {
  AddToCartDto,
  UpdateCartItemDto,
  UpdateCartSettingsDto,
  CheckoutCartDto,
} from './dto/cart.dto';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CompanyScopeGuard } from 'src/common/guards/company-scope.guard';
import { CurrentCompany } from 'src/common/guards/current-company.decorator';

interface JwtUser {
  sub: string;
  role: Role;
}

@ApiTags('Cart (POS Session)')
@ApiBearerAuth()
@ApiSecurity('X-Company-Id')
@UseGuards(JwtAuthGuard, CompanyScopeGuard, RolesGuard)
@Controller('billing/cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get current cart' })
  async getCart(
    @CurrentUser() user: JwtUser,
    @CurrentCompany() companyId: string,
  ) {
    return this.cartService.getCart(user.sub, companyId);
  }

  @Post('items')
  @Roles(Role.ADMIN, Role.STAFF)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add product to cart' })
  @ApiResponse({
    status: 400,
    description: 'Insufficient stock / Product not found',
  })
  async addItem(
    @Body() dto: AddToCartDto,
    @CurrentUser() user: JwtUser,
    @CurrentCompany() companyId: string,
  ) {
    return this.cartService.addItem(dto, user.sub, companyId);
  }

  @Patch('items/:itemId')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiParam({ name: 'itemId', description: 'Cart item ID' })
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user: JwtUser,
    @CurrentCompany() companyId: string,
  ) {
    return this.cartService.updateItem(itemId, dto, user.sub, companyId);
  }

  @Delete('items/:itemId')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiParam({ name: 'itemId', description: 'Cart item ID' })
  async removeItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtUser,
    @CurrentCompany() companyId: string,
  ) {
    return this.cartService.removeItem(itemId, user.sub, companyId);
  }

  @Patch('settings')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update cart settings' })
  async updateSettings(
    @Body() dto: UpdateCartSettingsDto,
    @CurrentUser() user: JwtUser,
    @CurrentCompany() companyId: string,
  ) {
    return this.cartService.updateSettings(dto, user.sub, companyId);
  }

  @Delete()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Clear entire cart' })
  async clearCart(
    @CurrentUser() user: JwtUser,
    @CurrentCompany() companyId: string,
  ) {
    return this.cartService.clearCart(user.sub, companyId);
  }

  @Post('checkout')
  @Roles(Role.ADMIN, Role.STAFF)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Checkout — convert cart to invoice' })
  @ApiResponse({ status: 201, description: 'Invoice created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Cart empty / No customer / Insufficient stock',
  })
  async checkout(
    @Body() dto: CheckoutCartDto,
    @CurrentUser() user: JwtUser,
    @CurrentCompany() companyId: string,
  ) {
    return this.cartService.checkout(dto, user.sub, companyId);
  }
}
