/*
  Warnings:

  - You are about to drop the `campaign` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `campaigndailymetric` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `campaign` DROP FOREIGN KEY `Campaign_metaAccountId_fkey`;

-- DropForeignKey
ALTER TABLE `campaigndailymetric` DROP FOREIGN KEY `CampaignDailyMetric_campaignId_fkey`;

-- DropTable
DROP TABLE `campaign`;

-- DropTable
DROP TABLE `campaigndailymetric`;
