/*
  Warnings:

  - You are about to drop the `Campaign` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CampaignDailyMetric` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `Campaign` DROP FOREIGN KEY `Campaign_metaAccountId_fkey`;

-- DropForeignKey
ALTER TABLE `CampaignDailyMetric` DROP FOREIGN KEY `CampaignDailyMetric_campaignId_fkey`;

-- DropTable
DROP TABLE `Campaign`;

-- DropTable
DROP TABLE `CampaignDailyMetric`;
