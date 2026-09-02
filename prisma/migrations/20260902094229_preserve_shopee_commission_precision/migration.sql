/*
  Warnings:

  - You are about to alter the column `commission` on the `campaigndailymetric` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(21,5)`.
  - You are about to alter the column `matchedCommission` on the `shopeecommissionimport` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(21,5)`.
  - You are about to alter the column `unmatchedCommission` on the `shopeecommissionimport` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(21,5)`.
  - You are about to alter the column `commission` on the `shopeecommissionimportunmatched` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(21,5)`.

*/
-- AlterTable
ALTER TABLE `campaigndailymetric` MODIFY `commission` DECIMAL(21, 5) NULL;

-- AlterTable
ALTER TABLE `shopeecommissionimport` MODIFY `matchedCommission` DECIMAL(21, 5) NOT NULL,
    MODIFY `unmatchedCommission` DECIMAL(21, 5) NOT NULL;

-- AlterTable
ALTER TABLE `shopeecommissionimportunmatched` MODIFY `commission` DECIMAL(21, 5) NOT NULL;
