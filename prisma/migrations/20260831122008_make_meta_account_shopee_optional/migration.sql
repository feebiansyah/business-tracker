-- DropForeignKey
ALTER TABLE `MetaAccount` DROP FOREIGN KEY `MetaAccount_shopeeAccountId_fkey`;

-- DropIndex
DROP INDEX `MetaAccount_shopeeAccountId_fkey` ON `MetaAccount`;

-- AlterTable
ALTER TABLE `MetaAccount` MODIFY `shopeeAccountId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `MetaAccount` ADD CONSTRAINT `MetaAccount_shopeeAccountId_fkey` FOREIGN KEY (`shopeeAccountId`) REFERENCES `ShopeeAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
