ALTER TABLE `Campaign`
  ADD COLUMN `firstDeliveryDate` DATE NULL,
  ADD COLUMN `firstDeliveryEligible` BOOLEAN NOT NULL DEFAULT false;
