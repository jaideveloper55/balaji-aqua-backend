/*
  Warnings:

  - You are about to drop the column `CustomerCode` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `outStandingBalance` on the `customers` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[customerCode]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `customerCode` to the `customers` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "customers_CustomerCode_key";

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "CustomerCode",
DROP COLUMN "outStandingBalance",
ADD COLUMN     "customerCode" TEXT NOT NULL,
ADD COLUMN     "outstandingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "customers_customerCode_key" ON "customers"("customerCode");
