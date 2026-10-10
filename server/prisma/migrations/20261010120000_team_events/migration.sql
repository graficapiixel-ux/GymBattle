-- Eventos de PvP em equipes e de Waves (só ADICIONA colunas; nada é apagado)
ALTER TABLE `BossEvent` ADD COLUMN `kind` VARCHAR(6) NOT NULL DEFAULT 'BOSS',
    ADD COLUMN `chanceAuto` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `BossRun` ADD COLUMN `vsRunId` VARCHAR(40) NULL,
    ADD COLUMN `queuedAt` DATETIME(3) NULL,
    ADD COLUMN `reached` INTEGER NULL;
