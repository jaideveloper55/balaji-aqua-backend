/*
  Warnings:

  - A unique constraint covering the columns `[eventOrderId]` on the table `invoices` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "eventOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_eventOrderId_key" ON "invoices"("eventOrderId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_eventOrderId_fkey" FOREIGN KEY ("eventOrderId") REFERENCES "event_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
