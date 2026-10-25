import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  AddToCartDto,
  UpdateCartItemDto,
  UpdateCartSettingsDto,
  CheckoutCartDto,
} from './dto/cart.dto';

import { BillingService } from './billing.service';

import { InvoiceType, InvoiceStatus, PaymentMode } from '@prisma/client';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly billingService: BillingService,
  ) {}

  // HELPER: Recalculate Cart Totals

  private calculateCartTotals(
    items: Array<{ quantity: number; unitPrice: number }>,

    gstEnabled: boolean,

    gstRate: number,

    discount: number,
  ) {
    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,

      0,
    );

    const afterDiscount = Math.max(0, subtotal - discount);

    const totalTax = gstEnabled ? (afterDiscount * gstRate) / 100 : 0;

    const cgst = totalTax / 2;

    const sgst = totalTax / 2;

    const totalAmount = afterDiscount + totalTax;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),

      cgst: parseFloat(cgst.toFixed(2)),

      sgst: parseFloat(sgst.toFixed(2)),

      totalAmount: parseFloat(totalAmount.toFixed(2)),
    };
  }

  // HELPER: Generate Payment Number

  private async generatePaymentNumber(companyId: string): Promise<string> {
    const today = new Date();

    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    const prefix = `PAY-${dateStr}-`;

    const last = await this.prisma.payment.findFirst({
      where: { companyId, paymentNumber: { startsWith: prefix } },

      orderBy: { paymentNumber: 'desc' },

      select: { paymentNumber: true },
    });

    let nextSerial = 1;

    if (last?.paymentNumber) {
      const lastSerial = parseInt(last.paymentNumber.slice(prefix.length), 10);

      if (!isNaN(lastSerial)) nextSerial = lastSerial + 1;
    }

    return prefix + String(nextSerial).padStart(3, '0');
  }

  // HELPER: Get or Create Cart

  private async getOrCreateCart(userId: string, companyId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId_companyId: { userId, companyId } },

      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,

                name: true,

                sku: true,

                unit: true,

                stock: true,

                basePrice: true,
              },
            },
          },

          orderBy: { createdAt: 'asc' },
        },

        customer: {
          select: {
            id: true,

            name: true,

            phone: true,

            outstandingBalance: true,
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId, companyId },

        include: {
          items: { include: { product: true } },

          customer: true,
        },
      });
    }

    return cart;
  }

  // GET CART

  async getCart(userId: string, companyId: string) {
    const cart = await this.getOrCreateCart(userId, companyId);

    const reconciledCart = await this.reconcilePrices(cart, companyId);

    const itemCount = reconciledCart.items.reduce(
      (sum, item) => sum + item.quantity,

      0,
    );

    return { ...reconciledCart, itemCount };
  }

  private async reconcilePrices(cart: any, companyId: string) {
    let changed = false;

    const updatedItems: any[] = [];

    for (const item of cart.items) {
      if (item.isCustomPrice) {
        updatedItems.push(item);

        continue;
      }

      const correctPrice = cart.customerId
        ? await this.billingService.getCustomerPrice(
            cart.customerId,

            item.productId,

            companyId,
          )
        : item.product.basePrice;

      if (Math.abs(correctPrice - item.unitPrice) > 0.001) {
        changed = true;

        const newLineTotal = item.quantity * correctPrice;

        await this.prisma.cartItem.update({
          where: { id: item.id },

          data: { unitPrice: correctPrice, lineTotal: newLineTotal },
        });

        updatedItems.push({
          ...item,

          unitPrice: correctPrice,

          lineTotal: newLineTotal,
        });
      } else {
        updatedItems.push(item);
      }
    }

    if (!changed) return cart;

    const totals = this.calculateCartTotals(
      updatedItems,

      cart.gstEnabled,

      cart.gstRate,

      cart.discount,
    );

    await this.prisma.cart.update({ where: { id: cart.id }, data: totals });

    return { ...cart, ...totals, items: updatedItems };
  }

  // ADD ITEM TO CART

  async addItem(dto: AddToCartDto, userId: string, companyId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, companyId, status: 'ACTIVE' },
    });

    if (!product) throw new NotFoundException('Product not found or inactive');

    if (product.stock < dto.quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${product.stock}`,
      );
    }

    const cart = await this.getOrCreateCart(userId, companyId);

    const defaultPrice = cart.customerId
      ? await this.billingService.getCustomerPrice(
          cart.customerId,

          dto.productId,

          companyId,
        )
      : product.basePrice;

    // Only counts as an override when the caller explicitly sends it.

    // "Not sent" (undefined) always falls through to customer/base price —

    // this is what makes it safe for the normal add-to-cart click.

    const isOverride = dto.unitPrice !== undefined;

    const effectivePrice = dto.unitPrice ?? defaultPrice;

    const existingItem = cart.items.find((i) => i.productId === dto.productId);

    await this.prisma.$transaction(async (tx) => {
      if (existingItem) {
        const newQty = existingItem.quantity + dto.quantity;

        if (newQty > product.stock) {
          throw new BadRequestException(
            `Cannot add ${dto.quantity} more. Stock available: ${product.stock}, already in cart: ${existingItem.quantity}`,
          );
        }

        const priceToUse = isOverride
          ? effectivePrice
          : existingItem.isCustomPrice
            ? existingItem.unitPrice
            : effectivePrice;

        const staysCustom = isOverride || existingItem.isCustomPrice;

        await tx.cartItem.update({
          where: { id: existingItem.id },

          data: {
            quantity: newQty,

            unitPrice: priceToUse,

            lineTotal: newQty * priceToUse,

            isCustomPrice: staysCustom,

            basePrice: staysCustom
              ? isOverride
                ? defaultPrice
                : existingItem.basePrice
              : null,
          },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,

            productId: dto.productId,

            productName: product.name,

            sku: product.sku,

            unit: product.unit,

            quantity: dto.quantity,

            unitPrice: effectivePrice,

            lineTotal: dto.quantity * effectivePrice,

            isCustomPrice: isOverride,

            basePrice: isOverride ? defaultPrice : null,

            companyId,
          },
        });
      }

      await this.refreshCartTotals(
        tx,

        cart.id,

        cart.gstEnabled,

        cart.gstRate,

        cart.discount,
      );
    });

    return this.getCart(userId, companyId);
  }

  // UPDATE ITEM

  async updateItem(
    cartItemId: string,

    dto: UpdateCartItemDto,

    userId: string,

    companyId: string,
  ) {
    const cartItem = await this.prisma.cartItem.findFirst({
      where: { id: cartItemId, cart: { userId, companyId } },

      include: {
        cart: true,

        product: { select: { stock: true, basePrice: true } },
      },
    });

    if (!cartItem) throw new NotFoundException('Cart item not found');

    const newQuantity = dto.quantity ?? cartItem.quantity;

    await this.prisma.$transaction(async (tx) => {
      if (newQuantity === 0) {
        await tx.cartItem.delete({ where: { id: cartItemId } });
      } else {
        if (newQuantity > cartItem.product.stock) {
          throw new BadRequestException(
            `Only ${cartItem.product.stock} units available in stock`,
          );
        }

        let newUnitPrice = cartItem.unitPrice;

        let isCustomPrice = cartItem.isCustomPrice;

        let basePriceSnapshot = cartItem.basePrice;

        if (dto.resetToDefaultPrice) {
          newUnitPrice = cartItem.cart.customerId
            ? await this.billingService.getCustomerPrice(
                cartItem.cart.customerId,

                cartItem.productId,

                companyId,
              )
            : cartItem.product.basePrice;

          isCustomPrice = false;

          basePriceSnapshot = null;
        } else if (dto.unitPrice !== undefined) {
          if (dto.unitPrice < 0) {
            throw new BadRequestException('Rate cannot be negative');
          }

          if (!cartItem.isCustomPrice) {
            basePriceSnapshot = cartItem.unitPrice;
          }

          newUnitPrice = dto.unitPrice;

          isCustomPrice = true;
        }

        await tx.cartItem.update({
          where: { id: cartItemId },

          data: {
            quantity: newQuantity,

            unitPrice: newUnitPrice,

            lineTotal: newQuantity * newUnitPrice,

            isCustomPrice,

            basePrice: basePriceSnapshot,
          },
        });
      }

      await this.refreshCartTotals(
        tx,

        cartItem.cartId,

        cartItem.cart.gstEnabled,

        cartItem.cart.gstRate,

        cartItem.cart.discount,
      );
    });

    return this.getCart(userId, companyId);
  }

  // REMOVE ITEM

  async removeItem(cartItemId: string, userId: string, companyId: string) {
    return this.updateItem(cartItemId, { quantity: 0 }, userId, companyId);
  }

  // UPDATE CART SETTINGS

  async updateSettings(
    dto: UpdateCartSettingsDto,

    userId: string,

    companyId: string,
  ) {
    const cart = await this.getOrCreateCart(userId, companyId);

    const customerIdProvided = dto.customerId !== undefined;

    let newCustomerId = customerIdProvided ? dto.customerId : cart.customerId;

    const newInvoiceType = dto.invoiceType ?? cart.invoiceType;

    if (newInvoiceType === InvoiceType.WALK_IN) {
      newCustomerId = null;
    }

    const repriceItems = newCustomerId !== cart.customerId;

    const gstEnabled = dto.gstEnabled ?? cart.gstEnabled;

    const gstRate = dto.gstRate ?? cart.gstRate;

    const discount = dto.discount ?? cart.discount;

    await this.prisma.$transaction(async (tx) => {
      if (repriceItems) {
        for (const item of cart.items) {
          if (item.isCustomPrice) continue;

          const newPrice = newCustomerId
            ? await this.billingService.getCustomerPrice(
                newCustomerId,

                item.productId,

                companyId,
              )
            : item.product.basePrice;

          await tx.cartItem.update({
            where: { id: item.id },

            data: { unitPrice: newPrice, lineTotal: item.quantity * newPrice },
          });
        }
      }

      await tx.cart.update({
        where: { id: cart.id },

        data: {
          customerId: newCustomerId,

          walkInName: dto.walkInName ?? cart.walkInName,

          walkInPhone: dto.walkInPhone ?? cart.walkInPhone,

          invoiceType: newInvoiceType,

          gstEnabled,

          gstRate,

          discount,

          notes: dto.notes ?? cart.notes,
        },
      });

      await this.refreshCartTotals(tx, cart.id, gstEnabled, gstRate, discount);
    });

    return this.getCart(userId, companyId);
  }

  // CLEAR CART

  async clearCart(userId: string, companyId: string) {
    const cart = await this.getOrCreateCart(userId, companyId);

    await this.prisma.$transaction([
      this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } }),

      this.prisma.cart.update({
        where: { id: cart.id },

        data: {
          customerId: null,

          walkInName: null,

          walkInPhone: null,

          invoiceType: InvoiceType.SALE,

          gstEnabled: false,

          gstRate: 18,

          discount: 0,

          notes: null,

          subtotal: 0,

          cgst: 0,

          sgst: 0,

          totalAmount: 0,
        },
      }),
    ]);

    return { message: 'Cart cleared', itemCount: 0 };
  }

  // CHECKOUT

  async checkout(dto: CheckoutCartDto, userId: string, companyId: string) {
    const cart = await this.getOrCreateCart(userId, companyId);

    if (cart.items.length === 0) {
      throw new BadRequestException(
        'Cart is empty. Add products before checkout.',
      );
    }

    const isWalkIn = cart.invoiceType === InvoiceType.WALK_IN;

    if (!isWalkIn && !cart.customerId) {
      throw new BadRequestException(
        'Please select a customer before checkout.',
      );
    }

    if (isWalkIn && !cart.walkInName) {
      throw new BadRequestException('Please enter walk-in customer name.');
    }

    // Re-verify stock

    for (const item of cart.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },

        select: { stock: true, name: true },
      });

      if (!product || product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${item.productName}". Available: ${product?.stock ?? 0}`,
        );
      }
    }

    // Build invoice DTO

    const createInvoiceDto = {
      invoiceType: cart.invoiceType,

      customerId: cart.customerId ?? undefined,

      walkInName: cart.walkInName ?? undefined,

      walkInPhone: cart.walkInPhone ?? undefined,

      gstEnabled: cart.gstEnabled,

      gstRate: cart.gstRate,

      notes: cart.notes ?? undefined,

      dueDate: dto.dueDate,

      items: cart.items.map((item) => ({
        productId: item.productId,

        quantity: item.quantity,

        unitPrice: item.unitPrice,

        discount: 0,
      })),
    };

    // Create the invoice

    const invoice = await this.billingService.createInvoice(
      createInvoiceDto,

      companyId,

      userId,
    );

    // Apply cart-level discount

    if (cart.discount > 0) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },

        data: {
          totalAmount: { decrement: cart.discount },

          balanceDue: { decrement: cart.discount },

          subtotal: { decrement: cart.discount },

          notes: cart.notes ?? undefined,
        },
      });

      if (cart.customerId) {
        await this.prisma.customer.update({
          where: { id: cart.customerId },

          data: { outstandingBalance: { decrement: cart.discount } },
        });
      }
    }

    // Final amount after discount

    const finalAmount = parseFloat(
      (invoice.totalAmount - (cart.discount || 0)).toFixed(2),
    );

    // Build the list of real-money splits to record

    type Split = { mode: PaymentMode; amount: number; referenceId?: string };

    let splits: Split[] = [];

    if (dto.payments && dto.payments.length > 0) {
      splits = dto.payments

        .filter((p) => p.amount > 0 && p.mode !== PaymentMode.CREDIT)

        .map((p) => ({
          mode: (p.mode as string) === 'CARD' ? PaymentMode.CASH : p.mode,

          amount: parseFloat(p.amount.toFixed(2)),

          referenceId: p.referenceId,
        }));
    } else {
      // Single-payment fast path (unchanged behavior)

      const paymentModeStr = dto.paymentMode?.toUpperCase();

      const isCreditSale = paymentModeStr === 'CREDIT' || !paymentModeStr;

      if (!isCreditSale) {
        const requestedAmount = dto.amountPaid ?? finalAmount;

        const actualPaidNow = Math.min(requestedAmount, finalAmount);

        if (actualPaidNow > 0) {
          splits = [
            {
              mode:
                paymentModeStr === 'CARD'
                  ? PaymentMode.CASH
                  : (paymentModeStr as PaymentMode),

              amount: parseFloat(actualPaidNow.toFixed(2)),

              referenceId: dto.referenceId,
            },
          ];
        }
      }
    }

    // Total being paid right now across all splits

    const paidNow = parseFloat(
      splits.reduce((s, p) => s + p.amount, 0).toFixed(2),
    );

    // Guard: cannot pay more than the invoice total

    if (paidNow > finalAmount + 0.01) {
      throw new BadRequestException(
        `Total paid (₹${paidNow}) exceeds invoice amount (₹${finalAmount}).`,
      );
    }

    const newBalance = parseFloat((finalAmount - paidNow).toFixed(2));

    const isFullyPaid = newBalance <= 0.01;

    const isPartialPayment = paidNow > 0 && !isFullyPaid;

    let finalStatus: InvoiceStatus = invoice.status;

    let finalPaidAmount = 0;

    let finalBalanceDue = finalAmount;

    if (splits.length > 0) {
      // Pre-generate sequential payment numbers (one per split) up front.

      // Doing it before the txn keeps the numbering helper simple.

      const baseNumber = await this.generatePaymentNumber(companyId);

      // baseNumber looks like PAY-YYYYMMDD-NNN; derive sequential suffixes

      const prefix = baseNumber.slice(0, baseNumber.lastIndexOf('-') + 1);

      const startSerial = parseInt(
        baseNumber.slice(baseNumber.lastIndexOf('-') + 1),

        10,
      );

      await this.prisma.$transaction(async (tx) => {
        let runningBalance: number | null = null;

        for (let i = 0; i < splits.length; i++) {
          const split = splits[i];

          const paymentNumber =
            prefix + String(startSerial + i).padStart(3, '0');

          await tx.payment.create({
            data: {
              paymentNumber,

              customerId: cart.customerId ?? null,

              walkInName: cart.walkInName ?? null,

              walkInPhone: cart.walkInPhone ?? null,

              invoiceId: invoice.id,

              companyId,

              createdById: userId,

              amount: split.amount,

              paymentMode: split.mode,

              referenceId: split.referenceId ?? null,

              paymentDate: new Date(),
            },
          });

          // Ledger + outstanding only for non-walk-in (real customers)

          if (cart.customerId) {
            await tx.customer.update({
              where: { id: cart.customerId },

              data: { outstandingBalance: { decrement: split.amount } },
            });

            const updated = await tx.customer.findUnique({
              where: { id: cart.customerId },

              select: { outstandingBalance: true },
            });

            runningBalance = updated!.outstandingBalance;

            await tx.customerLedger.create({
              data: {
                customerId: cart.customerId,

                companyId,

                entryType: 'PAYMENT',

                paymentMode: split.mode,

                referenceNo: paymentNumber,

                description:
                  splits.length > 1
                    ? `Split payment (${split.mode}) against ${invoice.invoiceNumber}`
                    : isPartialPayment
                      ? `Partial payment against ${invoice.invoiceNumber}`
                      : `Payment against ${invoice.invoiceNumber}`,

                debitAmount: 0,

                creditAmount: split.amount,

                balance: runningBalance,

                entryDate: new Date(),
              },
            });
          }
        }

        // Update invoice once with the summed totals

        await tx.invoice.update({
          where: { id: invoice.id },

          data: {
            paidAmount: paidNow,

            balanceDue: newBalance,

            status: isFullyPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL,
          },
        });
      });

      finalStatus = isFullyPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

      finalPaidAmount = paidNow;

      finalBalanceDue = newBalance;
    }

    // Extra payment toward previous outstanding invoices.
    // Allocate the amount to unpaid invoices, oldest first, so invoice balances
    // and payment history remain consistent.
    // Extra payment toward previous outstanding.
    // 1) Allocate to unpaid old invoices, oldest first.
    // 2) Whatever is left reduces the opening balance (no invoice attached).
    if (
      dto.extraPayment !== undefined &&
      dto.extraPayment > 0 &&
      cart.customerId
    ) {
      const extraAmount = Number(dto.extraPayment.toFixed(2));
      const extraMode: PaymentMode = splits[0]?.mode ?? PaymentMode.CASH;

      await this.prisma.$transaction(async (tx) => {
        const customerNow = await tx.customer.findUniqueOrThrow({
          where: { id: cart.customerId! },
          select: { outstandingBalance: true },
        });

        // Customer balance right now includes the unpaid part of the NEW bill.
        // Remove it to get what the customer owed BEFORE this bill.
        const previousOutstanding = Number(
          (customerNow.outstandingBalance - finalBalanceDue).toFixed(2),
        );

        if (extraAmount > previousOutstanding + 0.01) {
          throw new BadRequestException(
            `Extra payment ₹${extraAmount} exceeds previous outstanding ₹${Math.max(0, previousOutstanding)}.`,
          );
        }

        const unpaidInvoices = await tx.invoice.findMany({
          where: {
            companyId,
            customerId: cart.customerId!,
            status: { in: [InvoiceStatus.CONFIRMED, InvoiceStatus.PARTIAL] },
            balanceDue: { gt: 0 },
            id: { not: invoice.id },
          },
          orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }],
        });

        const firstPaymentNumber = await this.generatePaymentNumber(companyId);
        const lastDash = firstPaymentNumber.lastIndexOf('-');
        const paymentPrefix = firstPaymentNumber.slice(0, lastDash + 1);
        let nextSerial =
          Number.parseInt(firstPaymentNumber.slice(lastDash + 1), 10) || 1;
        let remaining = extraAmount;

        // Step 1: old invoices, oldest first
        for (const oldInvoice of unpaidInvoices) {
          if (remaining <= 0.001) break;

          const oldBalance = Number(oldInvoice.balanceDue);
          const allocatedAmount = Number(
            Math.min(remaining, oldBalance).toFixed(2),
          );
          if (allocatedAmount <= 0) continue;

          const newPaidAmount = Number(
            (Number(oldInvoice.paidAmount) + allocatedAmount).toFixed(2),
          );
          const newBalanceDue = Number(
            Math.max(0, oldBalance - allocatedAmount).toFixed(2),
          );

          await tx.payment.create({
            data: {
              paymentNumber:
                paymentPrefix + String(nextSerial++).padStart(3, '0'),
              customerId: cart.customerId!,
              invoiceId: oldInvoice.id,
              companyId,
              createdById: userId,
              amount: allocatedAmount,
              paymentMode: extraMode,
              referenceId: dto.referenceId ?? null,
              notes: `Extra payment allocated to ${oldInvoice.invoiceNumber}`,
              paymentDate: new Date(),
            },
          });

          await tx.invoice.update({
            where: { id: oldInvoice.id },
            data: {
              paidAmount: newPaidAmount,
              balanceDue: newBalanceDue,
              status:
                newBalanceDue <= 0.01
                  ? InvoiceStatus.PAID
                  : InvoiceStatus.PARTIAL,
            },
          });

          remaining = Number((remaining - allocatedAmount).toFixed(2));
        }

        // Step 2: leftover goes against the opening balance (no invoice)
        if (remaining > 0.01) {
          await tx.payment.create({
            data: {
              paymentNumber:
                paymentPrefix + String(nextSerial++).padStart(3, '0'),
              customerId: cart.customerId!,
              invoiceId: null,
              companyId,
              createdById: userId,
              amount: remaining,
              paymentMode: extraMode,
              referenceId: dto.referenceId ?? null,
              notes: 'Extra payment against opening balance',
              paymentDate: new Date(),
            },
          });
        }

        await tx.customer.update({
          where: { id: cart.customerId! },
          data: { outstandingBalance: { decrement: extraAmount } },
        });

        const updatedCustomer = await tx.customer.findUniqueOrThrow({
          where: { id: cart.customerId! },
          select: { outstandingBalance: true },
        });

        await tx.customerLedger.create({
          data: {
            customerId: cart.customerId!,
            companyId,
            entryType: 'PAYMENT',
            paymentMode: extraMode,
            referenceNo: firstPaymentNumber,
            description: `Extra payment of ₹${extraAmount} against previous outstanding`,
            debitAmount: 0,
            creditAmount: extraAmount,
            balance: updatedCustomer.outstandingBalance,
            entryDate: new Date(),
          },
        });
      });
    }

    // Clear the cart only after extra-payment processing succeeds.
    await this.clearCart(userId, companyId);

    return {
      message: isPartialPayment
        ? 'Checkout successful (partial payment recorded)'
        : 'Checkout successful',

      invoice: {
        id: invoice.id,

        invoiceNumber: invoice.invoiceNumber,

        totalAmount: finalAmount,

        paidAmount: finalPaidAmount,

        balanceDue: finalBalanceDue,

        status: finalStatus,
      },

      extraPaymentCollected: dto.extraPayment ?? 0,
    };
  }

  // PRIVATE HELPER: Refresh Cart Totals

  private async refreshCartTotals(
    tx: any,

    cartId: string,

    gstEnabled: boolean,

    gstRate: number,

    discount: number,
  ) {
    const freshItems = await tx.cartItem.findMany({ where: { cartId } });

    const totals = this.calculateCartTotals(
      freshItems,

      gstEnabled,

      gstRate,

      discount,
    );

    await tx.cart.update({ where: { id: cartId }, data: totals });
  }
}
