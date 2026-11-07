-- Review artifact only; do not apply to live databases during verification.
CREATE TABLE `MetaSyncRun` (
  `id` VARCHAR(36) NOT NULL,
  `shopeeAccountId` INTEGER NOT NULL,
  `activeShopeeAccountId` INTEGER NULL,
  `targetDate` DATE NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
  `generation` INTEGER NOT NULL DEFAULT 0,
  `usagePercent` INTEGER NOT NULL DEFAULT 0,
  `leaseOwner` VARCHAR(64) NULL,
  `leaseExpiresAt` DATETIME(3) NULL,
  `summary` JSON NOT NULL,
  `error` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MetaSyncRun_activeShopeeAccountId_key` (`activeShopeeAccountId`),
  INDEX `MetaSyncRun_shopeeAccountId_createdAt_idx` (`shopeeAccountId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MetaSyncRun_shopeeAccountId_fkey` FOREIGN KEY (`shopeeAccountId`) REFERENCES `ShopeeAccount` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MetaSyncWlProgress` (
  `id` VARCHAR(36) NOT NULL,
  `runId` VARCHAR(36) NOT NULL,
  `metaAccountId` INTEGER NULL,
  `accountId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `phase` VARCHAR(32) NOT NULL DEFAULT 'STATUS',
  `cursor` JSON NOT NULL,
  `error` VARCHAR(500) NULL,
  UNIQUE INDEX `MetaSyncWlProgress_runId_position_key` (`runId`, `position`),
  UNIQUE INDEX `MetaSyncWlProgress_runId_metaAccountId_key` (`runId`, `metaAccountId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MetaSyncWlProgress_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `MetaSyncRun` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `MetaSyncWlProgress_metaAccountId_fkey` FOREIGN KEY (`metaAccountId`) REFERENCES `MetaAccount` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
