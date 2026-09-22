-- CreateEnum
CREATE TYPE "MenuKey" AS ENUM ('DASHBOARD', 'CUSTOMER_MANAGEMENT', 'PRODUCT_MANAGEMENT', 'BILLING_POS', 'EVENT_ORDERS', 'INVENTORY', 'EXPENSES');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "companyId" TEXT;

-- CreateTable
CREATE TABLE "role_menu_permissions" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "menuKey" "MenuKey" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_menu_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_menu_permissions_role_menuKey_key" ON "role_menu_permissions"("role", "menuKey");

-- CreateIndex
CREATE INDEX "users_companyId_role_idx" ON "users"("companyId", "role");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
