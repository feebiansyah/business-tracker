-- AddColumn
ALTER TABLE `Campaign` ADD COLUMN `metaMetricSemanticVersion` INTEGER NOT NULL DEFAULT 1;

-- WidenColumn
ALTER TABLE `CampaignDailyMetric` MODIFY `cpcFp` DECIMAL(20, 6) NULL;
