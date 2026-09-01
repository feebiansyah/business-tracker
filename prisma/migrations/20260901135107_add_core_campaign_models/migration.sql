-- CreateTable
CREATE TABLE `Campaign` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `metaCampaignId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startTime` DATETIME(3) NULL,
    `metaStatus` VARCHAR(191) NULL,
    `effectiveStatus` VARCHAR(191) NULL,
    `effectiveDailyBudget` DECIMAL(18, 2) NULL,
    `budgetSource` VARCHAR(191) NOT NULL,
    `historySyncedThrough` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `metaAccountId` INTEGER NOT NULL,

    UNIQUE INDEX `Campaign_metaCampaignId_key`(`metaCampaignId`),
    INDEX `Campaign_metaAccountId_idx`(`metaAccountId`),
    INDEX `Campaign_metaStatus_effectiveDailyBudget_idx`(`metaStatus`, `effectiveDailyBudget`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CampaignDailyMetric` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `spend` DECIMAL(18, 2) NULL,
    `clickFp` INTEGER NULL,
    `cpcFp` DECIMAL(18, 4) NULL,
    `commission` DECIMAL(18, 2) NULL,
    `shopeeClicks` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `campaignId` INTEGER NOT NULL,

    INDEX `CampaignDailyMetric_date_idx`(`date`),
    UNIQUE INDEX `CampaignDailyMetric_campaignId_date_key`(`campaignId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_metaAccountId_fkey` FOREIGN KEY (`metaAccountId`) REFERENCES `MetaAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignDailyMetric` ADD CONSTRAINT `CampaignDailyMetric_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
