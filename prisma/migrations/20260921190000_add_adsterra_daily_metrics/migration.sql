-- CreateTable
CREATE TABLE `AdsterraCampaignDailyMetric` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `spendUsd` DECIMAL(20, 6) NULL,
    `commissionIdr` DECIMAL(21, 5) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `adsterraCampaignConfigId` INTEGER NOT NULL,

    INDEX `AdsterraCampaignDailyMetric_date_idx`(`date`),
    UNIQUE INDEX `AdsterraCampaignDailyMetric_adsterraCampaignConfigId_date_key`(`adsterraCampaignConfigId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `AdsterraCampaignConfig`
    ADD COLUMN `historySyncedThrough` DATE NULL,
    ADD UNIQUE INDEX `AdsterraCampaignConfig_shopeeAccountId_sourceTag_key`(`shopeeAccountId`, `sourceTag`);

-- AddForeignKey
ALTER TABLE `AdsterraCampaignDailyMetric` ADD CONSTRAINT `AdsterraCampaignDailyMetric_adsterraCampaignConfigId_fkey` FOREIGN KEY (`adsterraCampaignConfigId`) REFERENCES `AdsterraCampaignConfig`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
