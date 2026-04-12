-- Add fingerprint column to Transaction for SHA-256 deduplication
ALTER TABLE `Transaction`
  ADD COLUMN `fingerprint` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `Transaction_fingerprint_key` (`fingerprint`),
  ADD INDEX `Transaction_fingerprint_idx` (`fingerprint`);

-- Add skippedCount column to ImportBatch
ALTER TABLE `ImportBatch`
  ADD COLUMN `skippedCount` INTEGER NOT NULL DEFAULT 0;
