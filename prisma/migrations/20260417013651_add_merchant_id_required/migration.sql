/*
  Warnings:

  - Made the column `merchantId` on table `OrderItem` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "merchantId" SET NOT NULL;
