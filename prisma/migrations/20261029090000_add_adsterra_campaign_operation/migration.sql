-- Review artifact only. Do NOT apply as part of implementation/verification.
-- No foreign keys: unresolved operations survive config/account deletion.
CREATE TABLE `AdsterraCampaignOperation` (
    `campaignId` VARCHAR(64) NOT NULL,
    `operationId` CHAR(36) NOT NULL,
    `generation` INTEGER NOT NULL DEFAULT 0,
    `owner` VARCHAR(64) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'IDLE',
    `phase` VARCHAR(32) NOT NULL,
    `confirmationHash` CHAR(64) NULL,
    `preconditionHash` CHAR(64) NULL,
    `expiresAt` DATETIME(3) NULL,
    `uncertain` BOOLEAN NOT NULL DEFAULT false,
    `summary` VARCHAR(2000) NULL,
    `startedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `protectiveOffId` CHAR(36) NULL,
    `protectiveOffGeneration` INTEGER NOT NULL DEFAULT 0,
    `protectiveOffStatus` VARCHAR(32) NOT NULL DEFAULT 'IDLE',
    `protectiveOffUncertain` BOOLEAN NOT NULL DEFAULT false,
    `protectiveOffOwner` VARCHAR(64) NULL,
    `protectiveOffSummary` VARCHAR(1000) NULL,
    `protectiveOffAt` DATETIME(3) NULL,
    INDEX `AdsterraCampaignOperation_status_idx`(`status`),
    PRIMARY KEY (`campaignId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
