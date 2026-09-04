-- AlterTable
ALTER TABLE `MetaAccount` ADD COLUMN `spendHistorySyncedThrough` DATE NULL;

-- CreateTable
CREATE TABLE `MetaAccountDailySpend` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `spend` DECIMAL(18, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `metaAccountId` INTEGER NOT NULL,

    INDEX `MetaAccountDailySpend_date_idx`(`date`),
    UNIQUE INDEX `MetaAccountDailySpend_metaAccountId_date_key`(`metaAccountId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MetaAccountDailySpend` ADD CONSTRAINT `MetaAccountDailySpend_metaAccountId_fkey` FOREIGN KEY (`metaAccountId`) REFERENCES `MetaAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
