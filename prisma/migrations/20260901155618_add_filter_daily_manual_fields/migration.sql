-- AlterTable
ALTER TABLE `campaigndailymetric` ADD COLUMN `completed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `note` TEXT NULL;
