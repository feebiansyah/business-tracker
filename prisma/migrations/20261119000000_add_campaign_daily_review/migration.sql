ALTER TABLE `User` ADD COLUMN `role` ENUM('OPERATOR', 'REVIEWER') NOT NULL DEFAULT 'OPERATOR';

CREATE TABLE `CampaignDailyReview` (
    `userId` INTEGER NOT NULL,
    `campaignId` INTEGER NOT NULL,
    `businessDate` DATE NOT NULL,
    `reviewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CampaignDailyReview_campaignId_businessDate_idx`(`campaignId`, `businessDate`),
    PRIMARY KEY (`userId`, `campaignId`, `businessDate`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CampaignDailyReview` ADD CONSTRAINT `CampaignDailyReview_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CampaignDailyReview` ADD CONSTRAINT `CampaignDailyReview_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
