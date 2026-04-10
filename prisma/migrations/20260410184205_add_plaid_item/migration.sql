-- CreateTable
CREATE TABLE `PlaidItem` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userBankConnectionId` VARCHAR(191) NULL,
    `plaidItemId` VARCHAR(191) NOT NULL,
    `accessTokenEncrypted` VARCHAR(191) NOT NULL,
    `accessTokenIv` VARCHAR(191) NOT NULL,
    `accessTokenTag` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NULL,
    `institutionName` VARCHAR(191) NULL,
    `consentExpiresAt` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR') NOT NULL DEFAULT 'ACTIVE',
    `lastSyncedAt` DATETIME(3) NULL,
    `errorCode` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PlaidItem_userBankConnectionId_key`(`userBankConnectionId`),
    UNIQUE INDEX `PlaidItem_plaidItemId_key`(`plaidItemId`),
    INDEX `PlaidItem_userId_idx`(`userId`),
    INDEX `PlaidItem_plaidItemId_idx`(`plaidItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PlaidItem` ADD CONSTRAINT `PlaidItem_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaidItem` ADD CONSTRAINT `PlaidItem_userBankConnectionId_fkey` FOREIGN KEY (`userBankConnectionId`) REFERENCES `UserBankConnection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
