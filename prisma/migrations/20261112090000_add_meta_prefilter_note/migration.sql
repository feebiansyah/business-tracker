CREATE TABLE `MetaPrefilterNote` (
    `shopeeAccountId` INTEGER NOT NULL,
    `businessDate` DATE NOT NULL,
    `metaCampaignId` VARCHAR(64) NOT NULL,
    `note` VARCHAR(2000) NOT NULL DEFAULT '',
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`shopeeAccountId`, `businessDate`, `metaCampaignId`),
    CONSTRAINT `MetaPrefilterNote_shopeeAccountId_fkey` FOREIGN KEY (`shopeeAccountId`) REFERENCES `ShopeeAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
