-- AlterTable
ALTER TABLE `AdsterraCampaignConfig`
    ADD COLUMN `autoScheduleEnabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `AdsterraCampaignScheduleRun` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `businessDate` DATE NOT NULL,
    `action` ENUM('ON', 'OFF') NOT NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'FAILED', 'NO_CHANGE', 'SKIPPED_SPECIAL_DAY') NOT NULL,
    `actualStatus` VARCHAR(32) NULL,
    `errorMessage` VARCHAR(500) NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `adsterraCampaignConfigId` INTEGER NOT NULL,

    INDEX `AdsterraCampaignScheduleRun_businessDate_idx`(`businessDate`),
    UNIQUE INDEX `AdsterraScheduleRun_config_date_action_key`(`adsterraCampaignConfigId`, `businessDate`, `action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AdsterraCampaignScheduleRun` ADD CONSTRAINT `AdsterraCampaignScheduleRun_adsterraCampaignConfigId_fkey` FOREIGN KEY (`adsterraCampaignConfigId`) REFERENCES `AdsterraCampaignConfig`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
