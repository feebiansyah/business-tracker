-- CreateTable
CREATE TABLE `ShopeeClickImport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `originalFilename` VARCHAR(255) NOT NULL,
    `fileSha256` CHAR(64) NOT NULL,
    `dateFrom` DATE NOT NULL,
    `dateTo` DATE NOT NULL,
    `csvRowCount` INTEGER NOT NULL,
    `processedRowCount` INTEGER NOT NULL,
    `ignoredRowCount` INTEGER NOT NULL,
    `groupCount` INTEGER NOT NULL,
    `matchedCount` INTEGER NOT NULL,
    `unmatchedCount` INTEGER NOT NULL,
    `matchedClicks` INTEGER NOT NULL,
    `unmatchedClicks` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `shopeeAccountId` INTEGER NOT NULL,

    INDEX `ShopeeClickImport_shopeeAccountId_createdAt_idx`(`shopeeAccountId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopeeClickImportUnmatched` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `tagLink2` TEXT NOT NULL,
    `clickCount` INTEGER NOT NULL,
    `reason` VARCHAR(32) NOT NULL,
    `importId` INTEGER NOT NULL,

    INDEX `ShopeeClickImportUnmatched_importId_date_idx`(`importId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ShopeeClickImport` ADD CONSTRAINT `ShopeeClickImport_shopeeAccountId_fkey` FOREIGN KEY (`shopeeAccountId`) REFERENCES `ShopeeAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShopeeClickImportUnmatched` ADD CONSTRAINT `ShopeeClickImportUnmatched_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `ShopeeClickImport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
