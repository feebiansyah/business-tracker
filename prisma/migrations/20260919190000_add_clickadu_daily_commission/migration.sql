-- AlterTable
ALTER TABLE `ClickaduCampaignDailyMetric`
    ADD COLUMN `commissionIdr` DECIMAL(21, 5) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ClickaduCampaignConfig_shopeeAccountId_sourceTag_key`
    ON `ClickaduCampaignConfig`(`shopeeAccountId`, `sourceTag`);
