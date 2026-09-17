-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "deletedAt" TIMESTAMP(3);
