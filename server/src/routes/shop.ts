import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import {
  ARMOR_SETS_BY_ID, ARMOR_SLOTS, WEAPONS_BY_ID, armorPieceId, armorPiecePrice, armorSetPrice,
  parseArmorPieceId, isArmorRevealed, isWeaponRevealed, type ArmorSlot, type EquipSlot,
} from '@gymbattle/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { lockUser } from '../lib/rewards.js';
import { equipmentOf, toMe } from '../lib/serialize.js';

export const shopRouter = Router();
shopRouter.use(requireAuth);

/** Preço de um item avulso (arma ou peça de armadura). */
function priceOf(itemId: string): number {
  const w = WEAPONS_BY_ID[itemId];
  if (w) return w.price;
  const a = parseArmorPieceId(itemId);
  if (a) return armorPiecePrice(a.set, a.slot);
  throw notFound('Item não encontrado.');
}

shopRouter.get('/inventory', async (req, res) => {
  const items = await prisma.inventoryItem.findMany({ where: { userId: req.user!.id }, orderBy: { acquiredAt: 'desc' } });
  res.json({ items: items.map((i) => ({ itemId: i.itemId, acquiredAt: i.acquiredAt.toISOString() })) });
});

async function purchase(userId: string, itemIds: string[], total: number) {
  if (!Number.isInteger(total) || total <= 0 || !itemIds.length) throw badRequest('Item inválido.');
  return prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    const owned = await tx.inventoryItem.findMany({ where: { userId, itemId: { in: itemIds } } });
    if (owned.length) throw conflict('Você já tem esse item.', 'OWNED');
    if (user.gold < total) throw badRequest(`Ouro insuficiente. Faltam ${total - user.gold}.`, 'NO_GOLD');
    await tx.user.update({ where: { id: userId }, data: { gold: { decrement: total } } });
    await tx.inventoryItem.createMany({
      data: itemIds.map((itemId) => ({ userId, itemId, pricePaid: Math.round(total / itemIds.length) })),
    });
    await tx.rewardLedger.create({ data: { userId, source: 'PURCHASE', refId: itemIds.join(',').slice(0, 40), gold: -total } });
    return tx.user.findUniqueOrThrow({ where: { id: userId } });
  });
}

const HIDDEN = 'Esse item ainda está escondido. Evolua seus atributos para descobri-lo.';

shopRouter.post('/buy', async (req, res) => {
  const { itemId } = z.object({ itemId: z.string().max(96) }).parse(req.body);
  const price = priceOf(itemId);
  const u = req.user!;
  const attrs = { str: u.str, dex: u.dex, vig: u.vig, fort: u.fort, ess: u.ess, int: u.int, fai: u.fai };
  const w = WEAPONS_BY_ID[itemId];
  if (w && !isWeaponRevealed(w, attrs)) throw forbidden(HIDDEN);
  const piece = parseArmorPieceId(itemId);
  if (piece && !isArmorRevealed(piece.set, u.level)) throw forbidden(HIDDEN);
  const user = await purchase(req.user!.id, [itemId], price);
  res.json({ user: toMe(user), spent: price });
});

shopRouter.post('/buy-set', async (req, res) => {
  const { setId } = z.object({ setId: z.string().max(64) }).parse(req.body);
  const set = ARMOR_SETS_BY_ID[setId];
  if (!set) throw notFound('Conjunto não encontrado.');
  if (!isArmorRevealed(set, req.user!.level)) throw forbidden(HIDDEN);
  const owned = await prisma.inventoryItem.findMany({
    where: { userId: req.user!.id, itemId: { in: ARMOR_SLOTS.map((s) => armorPieceId(setId, s)) } },
  });
  const ownedSlots = owned.map((o) => parseArmorPieceId(o.itemId)!.slot);
  const missing = ARMOR_SLOTS.filter((s) => !ownedSlots.includes(s));
  if (!missing.length) throw conflict('Você já tem o conjunto completo.', 'OWNED');
  const price = armorSetPrice(set, ownedSlots);
  const user = await purchase(req.user!.id, missing.map((s) => armorPieceId(setId, s)), price);
  res.json({ user: toMe(user), spent: price });
});

/** Escolha da arma inicial gratuita (uma vez só). */
shopRouter.post('/starter', async (req, res) => {
  const { weaponId } = z.object({ weaponId: z.string().max(64) }).parse(req.body);
  const w = WEAPONS_BY_ID[weaponId];
  if (!w?.starter) throw badRequest('Escolha uma das armas iniciais.');
  const userId = req.user!.id;
  const user = await prisma.$transaction(async (tx) => {
    const u = await lockUser(tx, userId);
    if (u.starterWeapon) throw conflict('Você já escolheu sua arma inicial.', 'STARTER_TAKEN');
    await tx.inventoryItem.upsert({
      where: { userId_itemId: { userId, itemId: weaponId } },
      create: { userId, itemId: weaponId, pricePaid: 0 },
      update: {},
    });
    return tx.user.update({
      where: { id: userId },
      data: {
        starterWeapon: weaponId,
        equipment: { ...equipmentOf(u), weapon: weaponId } as unknown as Prisma.InputJsonValue,
      },
    });
  });
  res.json({ user: toMe(user) });
});

/** Equipar / desequipar. */
shopRouter.put('/equip', async (req, res) => {
  const { slot, itemId } = z
    .object({ slot: z.enum(['weapon', 'helm', 'chest', 'gloves', 'legs']), itemId: z.string().max(96).nullable() })
    .parse(req.body);
  const userId = req.user!.id;
  if (itemId) {
    if (slot === 'weapon' && !WEAPONS_BY_ID[itemId]) throw badRequest('Isso não é uma arma.');
    if (slot !== 'weapon' && parseArmorPieceId(itemId)?.slot !== (slot as ArmorSlot)) {
      throw badRequest('Essa peça não vai nesse lugar.');
    }
    const owns = await prisma.inventoryItem.findUnique({ where: { userId_itemId: { userId, itemId } } });
    if (!owns) throw badRequest('Você não tem esse item.');
  } else if (slot === 'weapon') {
    throw badRequest('Você precisa ter uma arma equipada.');
  }
  const eq = { ...equipmentOf(req.user!), [slot as EquipSlot]: itemId };
  const user = await prisma.user.update({ where: { id: userId }, data: { equipment: eq as unknown as Prisma.InputJsonValue } });
  res.json({ user: toMe(user) });
});
