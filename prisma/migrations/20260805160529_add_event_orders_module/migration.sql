-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('WEDDING', 'ENGAGEMENT', 'BIRTHDAY', 'CORPORATE', 'RELIGIOUS', 'HOUSE_WARMING', 'OTHER');

-- CreateEnum
CREATE TYPE "EventOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "EventCancellationReason" AS ENUM ('CUSTOMER_POSTPONED', 'CUSTOMER_CANCELLED', 'DATE_CHANGED', 'PAYMENT_NOT_RECEIVED', 'STOCK_UNAVAILABLE', 'OTHER');

-- CreateTable
CREATE TABLE "event_orders" (
    "id" TEXT NOT NULL,
    "eventNumber" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "expectedGuests" INTEGER NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "deliveryTime" TEXT NOT NULL,
    "pickupTime" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "venueName" TEXT NOT NULL,
    "venueAddress" TEXT NOT NULL,
    "venueCity" TEXT NOT NULL,
    "venuePincode" TEXT,
    "onSiteContactName" TEXT,
    "onSiteContactPhone" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "cgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advancePaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "securityDeposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "EventOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "EventPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "cancellationReason" "EventCancellationReason",
    "cancellationNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_order_items" (
    "id" TEXT NOT NULL,
    "eventOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "lineTotal" DOUBLE PRECISION NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_order_payments" (
    "id" TEXT NOT NULL,
    "eventOrderId" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL,
    "referenceId" TEXT,
    "notes" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_orders_companyId_idx" ON "event_orders"("companyId");

-- CreateIndex
CREATE INDEX "event_orders_companyId_status_idx" ON "event_orders"("companyId", "status");

-- CreateIndex
CREATE INDEX "event_orders_companyId_eventDate_idx" ON "event_orders"("companyId", "eventDate");

-- CreateIndex
CREATE INDEX "event_orders_customerId_idx" ON "event_orders"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "event_orders_eventNumber_companyId_key" ON "event_orders"("eventNumber", "companyId");

-- CreateIndex
CREATE INDEX "event_order_items_eventOrderId_idx" ON "event_order_items"("eventOrderId");

-- CreateIndex
CREATE INDEX "event_order_items_companyId_idx" ON "event_order_items"("companyId");

-- CreateIndex
CREATE INDEX "event_order_items_productId_idx" ON "event_order_items"("productId");

-- CreateIndex
CREATE INDEX "event_order_payments_companyId_idx" ON "event_order_payments"("companyId");

-- CreateIndex
CREATE INDEX "event_order_payments_eventOrderId_idx" ON "event_order_payments"("eventOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "event_order_payments_paymentNumber_companyId_key" ON "event_order_payments"("paymentNumber", "companyId");

-- AddForeignKey
ALTER TABLE "event_orders" ADD CONSTRAINT "event_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_orders" ADD CONSTRAINT "event_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_orders" ADD CONSTRAINT "event_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_order_items" ADD CONSTRAINT "event_order_items_eventOrderId_fkey" FOREIGN KEY ("eventOrderId") REFERENCES "event_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_order_items" ADD CONSTRAINT "event_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_order_payments" ADD CONSTRAINT "event_order_payments_eventOrderId_fkey" FOREIGN KEY ("eventOrderId") REFERENCES "event_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_order_payments" ADD CONSTRAINT "event_order_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
