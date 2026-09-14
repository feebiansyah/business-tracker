-- CreateTable
CREATE TABLE `TrafficCredential` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `provider` ENUM('CLICKADU') NOT NULL,
    `encryptedSecret` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `shopeeAccountId` INTEGER NOT NULL,

    INDEX `TrafficCredential_shopeeAccountId_idx`(`shopeeAccountId`),
    UNIQUE INDEX `TrafficCredential_shopeeAccountId_provider_key`(`shopeeAccountId`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TrafficCredential` ADD CONSTRAINT `TrafficCredential_shopeeAccountId_fkey` FOREIGN KEY (`shopeeAccountId`) REFERENCES `ShopeeAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
