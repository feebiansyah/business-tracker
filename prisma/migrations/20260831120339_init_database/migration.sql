/*
  Warnings:

  - Made the column `shopeeAccountId` on table `metaaccount` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `metaaccount` DROP FOREIGN KEY `MetaAccount_shopeeAccountId_fkey`;

-- DropIndex
DROP INDEX `MetaAccount_shopeeAccountId_fkey` ON `metaaccount`;

-- AlterTable
ALTER TABLE `metaaccount` MODIFY `shopeeAccountId` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `MetaAccount` ADD CONSTRAINT `MetaAccount_shopeeAccountId_fkey` FOREIGN KEY (`shopeeAccountId`) REFERENCES `ShopeeAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
