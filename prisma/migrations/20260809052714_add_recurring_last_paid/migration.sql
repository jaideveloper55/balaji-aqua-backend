-- AlterTable
ALTER TABLE "recurring_expenses" ADD COLUMN     "lastPaidAmount" DECIMAL(12,2),
ADD COLUMN     "lastPaidAt" TIMESTAMP(3);
