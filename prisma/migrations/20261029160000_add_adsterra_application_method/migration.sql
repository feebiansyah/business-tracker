-- Additive review artifact only. Do not execute during implementation.
ALTER TABLE `AdsterraCampaignOperation`
    ADD COLUMN `placementMethod` VARCHAR(16) NULL,
    ADD COLUMN `methodVersion` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `methodReady` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `approvedBlacklistHash` CHAR(64) NULL,
    ADD COLUMN `approvedWhitelistHash` CHAR(64) NULL;
