CREATE TABLE `ShopeeOverviewGroup` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ShopeeOverviewGroupMember` (
    `groupId` INTEGER NOT NULL,
    `shopeeAccountId` INTEGER NOT NULL,
    UNIQUE INDEX `ShopeeOverviewGroupMember_shopeeAccountId_key`(`shopeeAccountId`),
    PRIMARY KEY (`groupId`, `shopeeAccountId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ShopeeOverviewGroupMember` ADD CONSTRAINT `ShopeeOverviewGroupMember_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ShopeeOverviewGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ShopeeOverviewGroupMember` ADD CONSTRAINT `ShopeeOverviewGroupMember_shopeeAccountId_fkey` FOREIGN KEY (`shopeeAccountId`) REFERENCES `ShopeeAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
