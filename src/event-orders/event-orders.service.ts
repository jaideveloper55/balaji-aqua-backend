import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateEventOrderDto } from './dto/create-event-order.dto';
import {
  EventOrderStatus,
  EventPaymentStatus,
  MovementSource,
  MovementType,
  PaymentMode,
  Prisma,
} from '@prisma/client';
import {
  generateEventNumber,
  generateEventPaymentNumber,
} from './helpers/event-number.helper';
import { QueryEventOrdersDto } from './dto/query-event-orders.dto';
import { UpdateEventOrderDto } from './dto/update-event-order.dto';
import { RecordEventPaymentDto } from './dto/record-payment.dto';
import { CancelEventOrderDto } from './dto/cancel-event-order.dto';

@Injectable()
export class EventOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  //  CREATE EVENT ORDER

  async create(dto: CreateEventOrderDto, companyId: string, userId: string) {
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        companyId,
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'One or more products not found or do not belong to your company',
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Check stock availability
    for (const item of dto.items) {
      const product = productMap.get(item.productId)!;
      const availableStock = product.stock - product.reserved;
      if (availableStock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}`,
        );
      }
    }

    let subtotal = 0;
    const itemsData = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const lineTotal = item.quantity * item.unitPrice;
      subtotal += lineTotal;
      return {
        productId: item.productId,
        productName: product.name,
        sku: product.sku,
        unit: product.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal,
        companyId,
      };
    });
    const discount = dto.discount ?? 0;
    const taxableAmount = subtotal - discount;

    let cgst = 0;
    let sgst = 0;
    if (dto.gstEnabled) {
      cgst = +(taxableAmount * 0.09).toFixed(2);
      sgst = +(taxableAmount * 0.09).toFixed(2);
    }

    const totalAmount = +(taxableAmount + cgst + sgst).toFixed(2);
    const advancePaid = dto.advancePaid ?? 0;
    const securityDeposit = dto.securityDeposit ?? 0;
    const balanceDue = +(totalAmount - advancePaid).toFixed(2);

    // Determine initial payment status
    let paymentStatus: EventPaymentStatus = EventPaymentStatus.UNPAID;
    if (advancePaid > 0 && advancePaid < totalAmount) {
      paymentStatus = EventPaymentStatus.PARTIAL;
    } else if (advancePaid >= totalAmount) {
      paymentStatus = EventPaymentStatus.PAID;
    }

    const eventNumber = await generateEventNumber(this.prisma, companyId);

    // TRANSACTION

    const eventOrder = await this.prisma.$transaction(async (tx) => {
      const created = await tx.eventOrder.create({
        data: {
          eventNumber,
          eventName: dto.eventName,
          eventType: dto.eventType,
          expectedGuests: dto.expectedGuests,
          eventDate: new Date(dto.eventDate),
          deliveryTime: dto.deliveryTime,
          pickupTime: dto.pickupTime,
          customerId: dto.customerId,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          venueName: dto.venueName,
          venueAddress: dto.venueAddress,
          venueCity: dto.venueCity,
          venuePincode: dto.venuePincode,
          onSiteContactName: dto.onSiteContactName,
          onSiteContactPhone: dto.onSiteContactPhone,
          subtotal,
          discount,
          gstEnabled: dto.gstEnabled ?? false,
          gstRate: 18,
          cgst,
          sgst,
          totalAmount,
          advancePaid,
          securityDeposit,
          balanceDue,
          status: EventOrderStatus.CONFIRMED,
          paymentStatus,
          notes: dto.notes,
          companyId,
          createdById: userId,
          items: { create: itemsData },
        },
        include: { items: true },
      });

      for (const item of dto.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { reserved: { increment: item.quantity } },
        });
      }

      if (advancePaid > 0) {
        const paymentNumber = await generateEventPaymentNumber(
          this.prisma,
          companyId,
        );
        await tx.eventOrderPayment.create({
          data: {
            paymentNumber,
            eventOrderId: created.id,
            amount: advancePaid,
            paymentMode:
              (dto.advancePaymentMode as PaymentMode) ?? PaymentMode.CASH,
            notes: 'Advance payment at event creation',
            companyId,
            createdById: userId,
          },
        });
      }

      return created;
    });

    return eventOrder;
  }

  //  LIST EVENT ORDERS
  async findAll(query: QueryEventOrdersDto, companyId: string) {
    const {
      search,
      type,
      status,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;

    const where: Prisma.EventOrderWhereInput = {
      companyId,
    };

    if (type) where.eventType = type;
    if (status) where.status = status;

    // Date range filter
    if (dateFrom || dateTo) {
      where.eventDate = {};
      if (dateFrom) where.eventDate.gte = new Date(dateFrom);
      if (dateTo) where.eventDate.lte = new Date(dateTo);
    }

    if (search) {
      where.OR = [
        { eventNumber: { contains: search, mode: 'insensitive' } },
        { eventName: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { venueName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.eventOrder.count({ where }),
      this.prisma.eventOrder.findMany({
        where,
        include: {
          items: {
            select: {
              id: true,
              productName: true,
              quantity: true,
              unitPrice: true,
            },
          },
          _count: { select: { items: true, payments: true } },
        },
        orderBy: { eventDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  //  DASHBOARD STATS

  async getStats(companyId: string) {
    const now = new Date();

    const [totalEvents, upcomingEvents, revenueAgg, duesAgg] =
      await Promise.all([
        // 1. Total events (excluding cancelled — those don't really count)
        this.prisma.eventOrder.count({
          where: {
            companyId,
            status: { not: EventOrderStatus.CANCELLED },
          },
        }),

        // 2. Upcoming events (future date, not cancelled)
        this.prisma.eventOrder.count({
          where: {
            companyId,
            eventDate: { gte: now },
            status: {
              notIn: [EventOrderStatus.CANCELLED, EventOrderStatus.COMPLETED],
            },
          },
        }),

        // 3. Total revenue = sum of totalAmount for non-cancelled events
        this.prisma.eventOrder.aggregate({
          where: {
            companyId,
            status: { not: EventOrderStatus.CANCELLED },
          },
          _sum: { totalAmount: true },
        }),

        // 4. Pending dues = sum of balanceDue for non-cancelled events
        this.prisma.eventOrder.aggregate({
          where: {
            companyId,
            status: { not: EventOrderStatus.CANCELLED },
            balanceDue: { gt: 0 },
          },
          _sum: { balanceDue: true },
        }),
      ]);

    return {
      totalEvents,
      upcomingEvents,
      totalRevenue: revenueAgg._sum.totalAmount ?? 0,
      pendingDues: duesAgg._sum.balanceDue ?? 0,
    };
  }

  //  GET ONE EVENT ORDER

  async findOne(id: string, companyId: string) {
    const eventOrder = await this.prisma.eventOrder.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        items: true,
        payments: {
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        customer: {
          select: { id: true, name: true, phone: true, email: true },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!eventOrder) {
      throw new NotFoundException(`Event order with ID ${id} not found`);
    }

    return eventOrder;
  }

  //  UPDATE EVENT ORDER
  async update(id: string, dto: UpdateEventOrderDto, companyId: string) {
    const existing = await this.prisma.eventOrder.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException(`Event order ${id} not found`);

    if (
      existing.status === EventOrderStatus.CANCELLED ||
      existing.status === EventOrderStatus.COMPLETED
    ) {
      throw new BadRequestException(
        `Cannot update event in ${existing.status} status`,
      );
    }

    return this.prisma.eventOrder.update({
      where: { id },
      data: {
        ...dto,

        eventDate: dto.eventDate ? new Date(dto.eventDate) : undefined,
      },
    });
  }

  //  UPDATE STATUS

  async updateStatus(
    id: string,
    newStatus: EventOrderStatus,
    companyId: string,
    userId: string,
  ) {
    const existing = await this.prisma.eventOrder.findFirst({
      where: { id, companyId },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException(`Event order ${id} not found`);

    if (existing.status === EventOrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot change status of a cancelled event',
      );
    }

    if (
      newStatus === EventOrderStatus.DELIVERED &&
      existing.status !== EventOrderStatus.DELIVERED
    ) {
      return this.prisma.$transaction(async (tx) => {
        for (const item of existing.items) {
          // Decrement both stock AND reserved (item is now delivered, not just reserved)
          const updatedProduct = await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: { decrement: item.quantity },
              reserved: { decrement: item.quantity },
            },
          });

          // Log a stock movement for audit trail
          // WHY: You should always be able to answer "why did stock decrease?"
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              productName: item.productName,
              sku: item.sku,
              unit: item.unit,
              type: MovementType.STOCK_OUT,
              source: MovementSource.DELIVERY,
              quantity: item.quantity,
              balanceAfter: updatedProduct.stock,
              referenceId: existing.eventNumber,
              remarks: `Delivered for event: ${existing.eventName}`,
              createdById: userId,
              companyId,
            },
          });
        }

        return tx.eventOrder.update({
          where: { id },
          data: { status: newStatus },
        });
      });
    }

    return this.prisma.eventOrder.update({
      where: { id },
      data: { status: newStatus },
    });
  }

  //  CANCEL EVENT ORDER

  async cancel(
    id: string,
    dto: CancelEventOrderDto,
    companyId: string,
    userId: string,
  ) {
    const existing = await this.prisma.eventOrder.findFirst({
      where: { id, companyId },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException(`Event order ${id} not found`);

    if (existing.status === EventOrderStatus.CANCELLED) {
      throw new BadRequestException('Event is already cancelled');
    }
    if (existing.status === EventOrderStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed event');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Release reserved stock ONLY if not yet delivered
      // WHY: If already delivered, stock is gone; nothing to release.
      if (existing.status !== EventOrderStatus.DELIVERED) {
        for (const item of existing.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { reserved: { decrement: item.quantity } },
          });
        }
      }

      // 2. Update event with cancellation info
      return tx.eventOrder.update({
        where: { id },
        data: {
          status: EventOrderStatus.CANCELLED,
          cancellationReason: dto.reason,
          cancellationNote: dto.note,
          cancelledAt: new Date(),
          cancelledById: userId,
        },
      });
    });
  }

  //  RECORD ADDITIONAL PAYMENT

  async recordPayment(
    id: string,
    dto: RecordEventPaymentDto,
    companyId: string,
    userId: string,
  ) {
    const existing = await this.prisma.eventOrder.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException(`Event order ${id} not found`);

    if (existing.status === EventOrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot record payment on a cancelled event',
      );
    }

    // Prevent overpayment
    if (dto.amount > existing.balanceDue) {
      throw new BadRequestException(
        `Payment amount (${dto.amount}) exceeds balance due (${existing.balanceDue})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the payment record
      const paymentNumber = await generateEventPaymentNumber(
        this.prisma,
        companyId,
      );
      const payment = await tx.eventOrderPayment.create({
        data: {
          paymentNumber,
          eventOrderId: id,
          amount: dto.amount,
          paymentMode: dto.paymentMode,
          referenceId: dto.referenceId,
          notes: dto.notes,
          companyId,
          createdById: userId,
        },
      });

      // 2. Update the event totals
      const newAdvancePaid = +(existing.advancePaid + dto.amount).toFixed(2);
      const newBalanceDue = +(existing.totalAmount - newAdvancePaid).toFixed(2);
      const newPaymentStatus: EventPaymentStatus =
        newBalanceDue <= 0
          ? EventPaymentStatus.PAID
          : EventPaymentStatus.PARTIAL;

      await tx.eventOrder.update({
        where: { id },
        data: {
          advancePaid: newAdvancePaid,
          balanceDue: newBalanceDue,
          paymentStatus: newPaymentStatus,
        },
      });

      return payment;
    });
  }



  async remove(id: string, companyId: string) {
    const existing = await this.prisma.eventOrder.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException(`Event order ${id} not found`);

    return this.prisma.eventOrder.delete({ where: { id } });
  }

  async deleteEventOrder(id: string, companyId: string, _userId: string) {
    const event = await this.prisma.eventOrder.findFirst({
      where: { id, companyId },
      include: {
        items: true,
        payments: true,
      },
    });

    if (!event) throw new NotFoundException('Event order not found');

    return this.prisma.$transaction(async (tx) => {
      // Delete direct event payments (EventOrderPayment rows).
      await tx.eventOrderPayment.deleteMany({
        where: { eventOrderId: event.id },
      });

      // Delete the event order. EventOrderItem cascades via FK.
      await tx.eventOrder.delete({
        where: { id: event.id },
      });

      return {
        success: true,
        message: `Event ${event.eventNumber} deleted.`,
        refundedEventPayments: event.payments.length,
      };
    });
  }
}
