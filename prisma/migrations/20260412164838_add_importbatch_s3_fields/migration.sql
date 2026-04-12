-- AlterTable
ALTER TABLE `ImportBatch` ADD COLUMN `fileKey` VARCHAR(191) NULL,
    ADD COLUMN `fileUploadError` VARCHAR(191) NULL,
    ADD COLUMN `fileUploadStatus` VARCHAR(191) NULL,
    ADD COLUMN `fileUrl` VARCHAR(191) NULL;
