CREATE TABLE `CampaignPostTypeOverride` (
    `shopeeAccountId` INTEGER NOT NULL,
    `metaCampaignId` VARCHAR(100) NOT NULL,
    `manualType` ENUM('VIDEO', 'GAMBAR_FEWFEED', 'GAMBAR_PRODUK') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`shopeeAccountId`, `metaCampaignId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CampaignPostTypeOverride` ADD CONSTRAINT `CampaignPostTypeOverride_shopeeAccountId_fkey` FOREIGN KEY (`shopeeAccountId`) REFERENCES `ShopeeAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
