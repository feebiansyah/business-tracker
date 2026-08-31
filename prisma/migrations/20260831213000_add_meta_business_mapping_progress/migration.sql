-- CreateTable
CREATE TABLE `MetaBusinessMappingProgress` (
    `id` INTEGER NOT NULL,
    `nextBusinessIndex` INTEGER NOT NULL DEFAULT 0,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `lastSyncAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
