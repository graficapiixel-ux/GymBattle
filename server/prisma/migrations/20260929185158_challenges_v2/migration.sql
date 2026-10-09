-- AlterTable
ALTER TABLE `Challenge` ADD COLUMN `prTransfer` INTEGER NULL;

-- AlterTable
ALTER TABLE `RewardLedger` ADD COLUMN `meta` JSON NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `protectedUntil` DATETIME(3) NULL,
    ADD COLUMN `tokenVersion` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `Challenge_challengerId_createdAt_idx` ON `Challenge`(`challengerId`, `createdAt`);

-- A primeira temporada começou no fim de setembro: adia o fim para o fim de outubro.
UPDATE `Season` SET `endsAt` = '2026-11-01 03:00:00.000', `name` = 'Temporada 1 · Outubro 2026'
WHERE `status` = 'ACTIVE' AND `number` = 1 AND `endsAt` <= '2026-10-01 03:00:00.000';
