-- CreateTable
CREATE TABLE `Battle` (
    `id` VARCHAR(191) NOT NULL,
    `mode` VARCHAR(12) NOT NULL,
    `seed` INTEGER NOT NULL,
    `map` VARCHAR(24) NOT NULL,
    `aId` VARCHAR(191) NULL,
    `bId` VARCHAR(191) NULL,
    `aName` VARCHAR(32) NOT NULL,
    `bName` VARCHAR(32) NOT NULL,
    `winner` INTEGER NULL,
    `duration` INTEGER NOT NULL,
    `replay` MEDIUMBLOB NOT NULL,
    `result` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Battle_aId_createdAt_idx`(`aId`, `createdAt`),
    INDEX `Battle_bId_createdAt_idx`(`bId`, `createdAt`),
    INDEX `Battle_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Battle` ADD CONSTRAINT `Battle_aId_fkey` FOREIGN KEY (`aId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Battle` ADD CONSTRAINT `Battle_bId_fkey` FOREIGN KEY (`bId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
