-- CreateIndex
CREATE INDEX `Transaction_bankAccountId_postedDate_idx` ON `Transaction`(`bankAccountId`, `postedDate`);
