-- AlterTable
ALTER TABLE `ClickaduCampaignConfig` ADD COLUMN `lastBlacklistReplacedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `AdsterraCampaignConfig` ADD COLUMN `lastBlacklistReplacedAt` DATETIME(3) NULL;
