-- AlterTable
ALTER TABLE "recurring_expenses" ADD COLUMN     "reminderAckedFor" TIMESTAMP(3),
ADD COLUMN     "reminderDays" INTEGER NOT NULL DEFAULT 5;
