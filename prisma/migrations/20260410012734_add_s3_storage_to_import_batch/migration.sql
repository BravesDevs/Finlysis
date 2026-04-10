-- AlterTable
ALTER TABLE `ImportBatch` ADD COLUMN `storageBucket` VARCHAR(191) NULL,
    ADD COLUMN `storageKey` VARCHAR(191) NULL,
    ADD COLUMN `storageRegion` VARCHAR(191) NULL,
    ADD COLUMN `storageUrl` VARCHAR(191) NULL;
