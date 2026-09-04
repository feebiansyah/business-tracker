/*
  Warnings:

  - You are about to alter the column `commission` on the `CampaignDailyMetric` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(21,5)`.
  - You are about to alter the column `matchedCommission` on the `ShopeeCommissionImport` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(21,5)`.
  - You are about to alter the column `unmatchedCommission` on the `ShopeeCommissionImport` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(21,5)`.
  - You are about to alter the column `commission` on the `ShopeeCommissionImportUnmatched` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(21,5)`.

*/
-- AlterTable
ALTER TABLE `CampaignDailyMetric` MODIFY `commission` DECIMAL(21, 5) NULL;

-- AlterTable
ALTER TABLE `ShopeeCommissionImport` MODIFY `matchedCommission` DECIMAL(21, 5) NOT NULL,
    MODIFY `unmatchedCommission` DECIMAL(21, 5) NOT NULL;

-- AlterTable
ALTER TABLE `ShopeeCommissionImportUnmatched` MODIFY `commission` DECIMAL(21, 5) NOT NULL;
