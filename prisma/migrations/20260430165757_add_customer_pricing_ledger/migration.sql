-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- CreateTable
CREATE TABLE "customer_pricing" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerPrice" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_ledger" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "debitAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_pricing_customerId_idx" ON "customer_pricing"("customerId");

-- CreateIndex
CREATE INDEX "customer_pricing_companyId_idx" ON "customer_pricing"("companyId");

-- CreateIndex
CREATE INDEX "customer_pricing_customerId_productId_idx" ON "customer_pricing"("customerId", "productId");

-- CreateIndex
CREATE INDEX "customer_ledger_customerId_idx" ON "customer_ledger"("customerId");

-- CreateIndex
CREATE INDEX "customer_ledger_companyId_idx" ON "customer_ledger"("companyId");

-- CreateIndex
CREATE INDEX "customer_ledger_customerId_entryDate_idx" ON "customer_ledger"("customerId", "entryDate");

-- CreateIndex
CREATE INDEX "customer_ledger_companyId_entryType_idx" ON "customer_ledger"("companyId", "entryType");

-- AddForeignKey
ALTER TABLE "customer_pricing" ADD CONSTRAINT "customer_pricing_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_ledger" ADD CONSTRAINT "customer_ledger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
