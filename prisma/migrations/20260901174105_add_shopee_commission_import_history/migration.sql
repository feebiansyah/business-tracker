-- CreateTable
CREATE TABLE `ShopeeCommissionImport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `originalFilename` VARCHAR(255) NOT NULL,
    `fileSha256` CHAR(64) NOT NULL,
    `dateFrom` DATE NOT NULL,
    `dateTo` DATE NOT NULL,
    `csvRowCount` INTEGER NOT NULL,
    `tagCount` INTEGER NOT NULL,
    `matchedCount` INTEGER NOT NULL,
    `unmatchedCount` INTEGER NOT NULL,
    `matchedCommission` DECIMAL(18, 2) NOT NULL,
    `unmatchedCommission` DECIMAL(18, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `shopeeAccountId` INTEGER NOT NULL,

    INDEX `ShopeeCommissionImport_shopeeAccountId_createdAt_idx`(`shopeeAccountId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopeeCommissionImportUnmatched` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `tagLink2` TEXT NOT NULL,
    `commission` DECIMAL(18, 2) NOT NULL,
    `rowCount` INTEGER NOT NULL,
    `reason` VARCHAR(32) NOT NULL,
    `importId` INTEGER NOT NULL,

    INDEX `ShopeeCommissionImportUnmatched_importId_date_idx`(`importId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ShopeeCommissionImport` ADD CONSTRAINT `ShopeeCommissionImport_shopeeAccountId_fkey` FOREIGN KEY (`shopeeAccountId`) REFERENCES `ShopeeAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShopeeCommissionImportUnmatched` ADD CONSTRAINT `ShopeeCommissionImportUnmatched_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `ShopeeCommissionImport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
