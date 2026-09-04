/*
  Warnings:

  - Made the column `shopeeAccountId` on table `MetaAccount` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `MetaAccount` DROP FOREIGN KEY `MetaAccount_shopeeAccountId_fkey`;

-- DropIndex
DROP INDEX `MetaAccount_shopeeAccountId_fkey` ON `MetaAccount`;

-- AlterTable
ALTER TABLE `MetaAccount` MODIFY `shopeeAccountId` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `MetaAccount` ADD CONSTRAINT `MetaAccount_shopeeAccountId_fkey` FOREIGN KEY (`shopeeAccountId`) REFERENCES `ShopeeAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
