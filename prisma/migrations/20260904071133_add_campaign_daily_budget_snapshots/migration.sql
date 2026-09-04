-- CreateTable
CREATE TABLE `CampaignDailyBudgetSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `dailyBudget` DECIMAL(18, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `campaignId` INTEGER NOT NULL,

    INDEX `CampaignDailyBudgetSnapshot_date_idx`(`date`),
    UNIQUE INDEX `CampaignDailyBudgetSnapshot_campaignId_date_key`(`campaignId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CampaignDailyBudgetSnapshot` ADD CONSTRAINT `CampaignDailyBudgetSnapshot_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
