/*
  Warnings:

  - You are about to drop the column `comments` on the `Post` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Post" DROP COLUMN "comments",
ADD COLUMN     "commentCount" INTEGER NOT NULL DEFAULT 0;
