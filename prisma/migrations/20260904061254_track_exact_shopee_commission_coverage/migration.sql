-- CreateTable
CREATE TABLE `ShopeeCommissionCoverage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `campaignId` INTEGER NOT NULL,

    UNIQUE INDEX `ShopeeCommissionCoverage_campaignId_date_key`(`campaignId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ShopeeCommissionCoverage` ADD CONSTRAINT `ShopeeCommissionCoverage_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
