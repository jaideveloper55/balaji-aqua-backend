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

interface JwtUser {
  userId: string;
  companyId: string;
  role: Role;
}

@ApiTags('Cart (POS Session)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing/cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}
  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Get current cart',
    description:
      'Returns the current cart for this user. Creates a new empty cart if none exists. Call this on POS page load to restore cart state after refresh.',
  })
  @ApiResponse({
    status: 200,
    description: 'Cart with items, totals, and settings',
    schema: {
      example: {
        id: 'clx_cart_id',
        customerId: null,
        customer: null,
        invoiceType: 'SALE',
        gstEnabled: false,
        gstRate: 18,
        discount: 0,
        subtotal: 330,
        cgst: 0,
        sgst: 0,
        totalAmount: 330,
        itemCount: 5,
        items: [
          {
            id: 'clx_item_1',
            productId: 'clx_prod',
            productName: '20L Water Can',
            sku: 'WC-20L',
            unit: 'PCS',
            quantity: 1,
            unitPrice: 40,
            lineTotal: 40,
            product: { stock: 250 },
          },
        ],
      },
    },
  })
  async getCart(@CurrentUser() user: JwtUser) {
    return this.cartService.getCart(user.userId, user.companyId);
  }

  // POST /billing/cart/items

  @Post('items')
  @Roles(Role.ADMIN, Role.STAFF)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add product to cart',
    description:
      'Adds a product to the cart. If product already exists, increments quantity. Returns the full updated cart.',
  })
  @ApiResponse({
    status: 400,
    description: 'Insufficient stock / Product not found',
  })
  async addItem(@Body() dto: AddToCartDto, @CurrentUser() user: JwtUser) {
    return this.cartService.addItem(dto, user.userId, user.companyId);
  }

  //  PATCH /billing/cart/items/:itemId

  @Patch('items/:itemId')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Update cart item quantity',
    description:
      'Change quantity with the +/- buttons. Send quantity: 0 to remove the item. Returns full updated cart.',
  })
  @ApiParam({
    name: 'itemId',
    description: 'Cart item ID (from items[].id in GET /billing/cart)',
  })
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.cartService.updateItem(
      itemId,
      dto,
      user.userId,
      user.companyId,
    );
  }

  //  DELETE /billing/cart/items/:itemId
  @Delete('items/:itemId')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Remove item from cart',
    description:
      'Removes a single product from the cart. Returns full updated cart.',
  })
  @ApiParam({ name: 'itemId', description: 'Cart item ID' })
  async removeItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.cartService.removeItem(itemId, user.userId, user.companyId);
  }

  //  PATCH /billing/cart/settings

  @Patch('settings')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Update cart settings',
    description: `
      Handles multiple cart-level changes:
      - Select customer → updates customerId, reprices items with customer custom pricing
      - Toggle GST → recalculates all totals with/without tax
      - Change discount → recalculates grand total
      - Set walk-in customer name
      Returns the full updated cart with recalculated totals.
    `,
  })
  async updateSettings(
    @Body() dto: UpdateCartSettingsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.cartService.updateSettings(dto, user.userId, user.companyId);
  }

  //  DELETE /billing/cart

  @Delete()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Clear entire cart',
    description:
      'Removes all items and resets cart to empty state. Called when "Clear All" is clicked.',
  })
  async clearCart(@CurrentUser() user: JwtUser) {
    return this.cartService.clearCart(user.userId, user.companyId);
  }

  //  POST /billing/cart/checkout

  @Post('checkout')
  @Roles(Role.ADMIN, Role.STAFF)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Checkout — convert cart to invoice',
    description: `
      Validates and converts the current cart into a confirmed Invoice.
      - Re-verifies stock availability
      - Creates invoice with all line items
      - Reduces product stock
      - Updates customer outstanding balance
      - Creates ledger entry
      - Clears the cart
      Returns the created invoice number and ID.
    `,
  })
  @ApiResponse({
    status: 201,
    description: 'Invoice created successfully',
    schema: {
      example: {
        message: 'Checkout successful',
        invoice: {
          id: 'clx_invoice_id',
          invoiceNumber: 'INV-20260503-001',
          totalAmount: 389,
          status: 'CONFIRMED',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cart empty / No customer / Insufficient stock',
  })
  async checkout(@Body() dto: CheckoutCartDto, @CurrentUser() user: JwtUser) {
    return this.cartService.checkout(dto, user.userId, user.companyId);
  }
}
