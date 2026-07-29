-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MovementSource" ADD VALUE 'SALE';
ALTER TYPE "MovementSource" ADD VALUE 'BOM_CONSUMED';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "consumesBom" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "product_boms" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantityPerUnit" DOUBLE PRECISION NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_boms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_boms_companyId_idx" ON "product_boms"("companyId");

-- CreateIndex
CREATE INDEX "product_boms_companyId_productId_idx" ON "product_boms"("companyId", "productId");

-- CreateIndex
CREATE INDEX "product_boms_componentId_idx" ON "product_boms"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "product_boms_productId_componentId_key" ON "product_boms"("productId", "componentId");

-- AddForeignKey
ALTER TABLE "product_boms" ADD CONSTRAINT "product_boms_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_boms" ADD CONSTRAINT "product_boms_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_boms" ADD CONSTRAINT "product_boms_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
