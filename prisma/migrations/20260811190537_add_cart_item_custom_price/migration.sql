-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "basePrice" DOUBLE PRECISION,
ADD COLUMN     "isCustomPrice" BOOLEAN NOT NULL DEFAULT false;
