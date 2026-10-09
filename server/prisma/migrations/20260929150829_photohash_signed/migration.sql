/*
  Warnings:

  - You are about to alter the column `hash` on the `PhotoHash` table. The data in that column could be lost. The data in that column will be cast from `UnsignedBigInt` to `BigInt`.

*/
-- AlterTable
ALTER TABLE `PhotoHash` MODIFY `hash` BIGINT NOT NULL;
