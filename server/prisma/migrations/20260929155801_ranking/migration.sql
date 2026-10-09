-- CreateTable
CREATE TABLE `Challenge` (
    `id` VARCHAR(191) NOT NULL,
    `challengerId` VARCHAR(191) NOT NULL,
    `defenderId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    `challengerPos` INTEGER NOT NULL,
    `defenderPos` INTEGER NOT NULL,
    `challengerPr` INTEGER NOT NULL,
    `defenderPr` INTEGER NOT NULL,
    `battleId` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `resolvedAt` DATETIME(3) NULL,

    INDEX `Challenge_defenderId_status_idx`(`defenderId`, `status`),
    INDEX `Challenge_challengerId_status_idx`(`challengerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Season` (
    `id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
    `results` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Season_number_key`(`number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Challenge` ADD CONSTRAINT `Challenge_challengerId_fkey` FOREIGN KEY (`challengerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Challenge` ADD CONSTRAINT `Challenge_defenderId_fkey` FOREIGN KEY (`defenderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
