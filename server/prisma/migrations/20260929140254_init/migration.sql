-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `username` VARCHAR(32) NOT NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `level` INTEGER NOT NULL DEFAULT 1,
    `xp` INTEGER NOT NULL DEFAULT 0,
    `gold` INTEGER NOT NULL DEFAULT 0,
    `attrPoints` INTEGER NOT NULL DEFAULT 0,
    `str` INTEGER NOT NULL DEFAULT 5,
    `dex` INTEGER NOT NULL DEFAULT 5,
    `vig` INTEGER NOT NULL DEFAULT 5,
    `fort` INTEGER NOT NULL DEFAULT 5,
    `ess` INTEGER NOT NULL DEFAULT 5,
    `int` INTEGER NOT NULL DEFAULT 5,
    `fai` INTEGER NOT NULL DEFAULT 5,
    `respecCount` INTEGER NOT NULL DEFAULT 0,
    `lastRespecAt` DATETIME(3) NULL,
    `streak` INTEGER NOT NULL DEFAULT 0,
    `lastPostDay` VARCHAR(10) NULL,
    `restWeeks` JSON NULL,
    `rankPoints` INTEGER NOT NULL DEFAULT 1000,
    `title` VARCHAR(64) NULL,
    `avatar` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_username_key`(`username`),
    INDEX `User_rankPoints_idx`(`rankPoints`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(64) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ModerationLog` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `targetId` VARCHAR(191) NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ModerationLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ModerationLog` ADD CONSTRAINT `ModerationLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModerationLog` ADD CONSTRAINT `ModerationLog_targetId_fkey` FOREIGN KEY (`targetId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
