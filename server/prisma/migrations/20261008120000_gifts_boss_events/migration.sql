-- CreateTable
CREATE TABLE `Gift` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(6) NOT NULL,
    `amount` INTEGER NOT NULL DEFAULT 0,
    `itemId` VARCHAR(96) NULL,
    `reason` VARCHAR(200) NULL,
    `popup` BOOLEAN NOT NULL DEFAULT false,
    `seenAt` DATETIME(3) NULL,
    `showAt` DATETIME(3) NULL,
    `source` VARCHAR(8) NOT NULL DEFAULT 'ADMIN',
    `eventId` VARCHAR(40) NULL,
    `byId` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Gift_userId_popup_seenAt_idx`(`userId`, `popup`, `seenAt`),
    INDEX `Gift_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BossEvent` (
    `id` VARCHAR(191) NOT NULL,
    `bossId` VARCHAR(40) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 3,
    `teamSize` INTEGER NOT NULL DEFAULT 1,
    `lootItemId` VARCHAR(96) NULL,
    `lootGold` INTEGER NOT NULL DEFAULT 0,
    `lootXp` INTEGER NOT NULL DEFAULT 0,
    `lootText` VARCHAR(300) NULL,
    `winChance` INTEGER NOT NULL DEFAULT 40,
    `announcedAt` DATETIME(3) NULL,
    `lastReminderAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BossEvent_startsAt_endsAt_idx`(`startsAt`, `endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BossRun` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `leaderId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'FORMING',
    `won` BOOLEAN NULL,
    `seed` INTEGER NOT NULL DEFAULT 0,
    `replay` MEDIUMBLOB NULL,
    `duration` INTEGER NOT NULL DEFAULT 0,
    `foughtAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BossRun_eventId_status_idx`(`eventId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BossRunMember` (
    `runId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accepted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BossRunMember_userId_idx`(`userId`),
    PRIMARY KEY (`runId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Gift` ADD CONSTRAINT `Gift_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BossRun` ADD CONSTRAINT `BossRun_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `BossEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BossRun` ADD CONSTRAINT `BossRun_leaderId_fkey` FOREIGN KEY (`leaderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BossRunMember` ADD CONSTRAINT `BossRunMember_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `BossRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BossRunMember` ADD CONSTRAINT `BossRunMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

