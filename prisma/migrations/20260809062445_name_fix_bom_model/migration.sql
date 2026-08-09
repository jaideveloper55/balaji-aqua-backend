-- CreateTable
CREATE TABLE "bom_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantityPerUnit" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bom_items_companyId_idx" ON "bom_items"("companyId");

-- CreateIndex
CREATE INDEX "bom_items_productId_idx" ON "bom_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "bom_items_productId_rawMaterialId_key" ON "bom_items"("productId", "rawMaterialId");

-- AddForeignKey
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
