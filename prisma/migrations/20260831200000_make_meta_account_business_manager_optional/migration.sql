-- DropForeignKey
ALTER TABLE `MetaAccount` DROP FOREIGN KEY `MetaAccount_businessManagerId_fkey`;

-- DropIndex
DROP INDEX `MetaAccount_businessManagerId_fkey` ON `MetaAccount`;

-- AlterTable
ALTER TABLE `MetaAccount` MODIFY `businessManagerId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `MetaAccount` ADD CONSTRAINT `MetaAccount_businessManagerId_fkey` FOREIGN KEY (`businessManagerId`) REFERENCES `BusinessManager`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
