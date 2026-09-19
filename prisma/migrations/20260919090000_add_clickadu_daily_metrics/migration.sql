-- CreateTable
CREATE TABLE `ClickaduCampaignDailyMetric` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `spendUsd` DECIMAL(20, 6) NULL,
    `dailyBudget` DECIMAL(20, 6) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `clickaduCampaignConfigId` INTEGER NOT NULL,

    UNIQUE INDEX `ClickaduCampaignDailyMetric_clickaduCampaignConfigId_date_key`(`clickaduCampaignConfigId`, `date`),
    INDEX `ClickaduCampaignDailyMetric_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClickaduCampaignDailyMetric` ADD CONSTRAINT `ClickaduCampaignDailyMetric_clickaduCampaignConfigId_fkey` FOREIGN KEY (`clickaduCampaignConfigId`) REFERENCES `ClickaduCampaignConfig`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
