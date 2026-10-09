-- AlterTable
ALTER TABLE `User` ADD COLUMN `equipment` JSON NULL,
    ADD COLUMN `starterWeapon` VARCHAR(64) NULL;

-- CreateTable
CREATE TABLE `InventoryItem` (
    `userId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(96) NOT NULL,
    `pricePaid` INTEGER NOT NULL DEFAULT 0,
    `acquiredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `itemId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InventoryItem` ADD CONSTRAINT `InventoryItem_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
