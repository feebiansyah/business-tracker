-- AlterEnum
ALTER TABLE `TrafficCredential` MODIFY `provider` ENUM('CLICKADU', 'ADSTERRA') NOT NULL;

-- CreateTable
CREATE TABLE `AdsterraCampaignConfig` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaignId` VARCHAR(64) NOT NULL,
    `label` VARCHAR(191) NULL,
    `sourceTag` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `shopeeAccountId` INTEGER NOT NULL,

    UNIQUE INDEX `AdsterraCampaignConfig_shopeeAccountId_campaignId_key`(`shopeeAccountId`, `campaignId`),
    INDEX `AdsterraCampaignConfig_shopeeAccountId_idx`(`shopeeAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AdsterraCampaignConfig` ADD CONSTRAINT `AdsterraCampaignConfig_shopeeAccountId_fkey` FOREIGN KEY (`shopeeAccountId`) REFERENCES `ShopeeAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
