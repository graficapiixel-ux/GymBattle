/**
 * Presentes: XP, ouro ou item dados a um jogador (pelo admin ou como espólio
 * de evento). Com motivo, o jogador vê o aviso grande ("RECOMPENSA RECEBIDA!")
 * na próxima vez que abrir o app; sem motivo, só recebe.
 */
import type { Gift, Prisma } from '@prisma/client';
import { ARMOR_SLOT_LABEL, WEAPONS_BY_ID, applyXp, parseArmorPieceId, type GiftDTO } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { badRequest } from './http.js';
import { lockUser } from './rewards.js';

type Tx = Prisma.TransactionClient;

export function itemInfo(itemId: string): { name: string; kind: 'weapon' | 'armor'; rarity: string } | null {
  const w = WEAPONS_BY_ID[itemId];
  if (w) return { name: w.name, kind: 'weapon', rarity: w.rarity };
  const a = parseArmorPieceId(itemId);
  if (a) return { name: `${a.set.name} · ${ARMOR_SLOT_LABEL[a.slot]}`, kind: 'armor', rarity: a.set.rarity };
  return null;
}

export interface GiftInput {
  userId: string;
  kind: 'XP' | 'GOLD' | 'ITEM';
  amount?: number;
  itemId?: string;
  reason?: string | null;
  source?: 'ADMIN' | 'EVENT';
  eventId?: string | null;
  byId?: string | null;
  showAt?: Date | null;
}

/**
 * Entrega o presente (dentro de uma transação) e registra. Valores negativos
 * (tirar XP/ouro pelo admin) nunca geram aviso.
 */
export async function grantGift(tx: Tx, g: GiftInput): Promise<Gift> {
  const reason = g.reason?.trim() || null;
  const amount = g.amount ?? 0;
  if (g.kind === 'XP') {
    const u = await lockUser(tx, g.userId);
    const next = applyXp({ level: u.level, xp: u.xp, attrPoints: u.attrPoints }, amount);
    await tx.user.update({ where: { id: u.id }, data: { level: next.level, xp: next.xp, attrPoints: next.attrPoints } });
    await tx.rewardLedger.create({ data: { userId: u.id, source: g.source ?? 'ADMIN', refId: g.eventId ?? 'xp', xp: amount, gold: 0 } });
  } else if (g.kind === 'GOLD') {
    const u = await lockUser(tx, g.userId);
    const gold = amount < 0 ? Math.max(Math.min(u.gold, 0), u.gold + amount) : u.gold + amount;
    await tx.user.update({ where: { id: u.id }, data: { gold } });
    await tx.rewardLedger.create({ data: { userId: u.id, source: g.source ?? 'ADMIN', refId: g.eventId ?? 'gold', xp: 0, gold: gold - u.gold } });
  } else {
    if (!g.itemId || !itemInfo(g.itemId)) throw badRequest('Item não encontrado.');
    await tx.inventoryItem.upsert({
      where: { userId_itemId: { userId: g.userId, itemId: g.itemId } },
      create: { userId: g.userId, itemId: g.itemId, pricePaid: 0 },
      update: {},
    });
  }
  return tx.gift.create({
    data: {
      userId: g.userId, kind: g.kind, amount: g.kind === 'ITEM' ? 1 : amount, itemId: g.kind === 'ITEM' ? g.itemId : null,
      reason, popup: !!reason && (g.kind === 'ITEM' || amount > 0),
      source: g.source ?? 'ADMIN', eventId: g.eventId ?? null, byId: g.byId ?? null, showAt: g.showAt ?? null,
    },
  });
}

export function toGiftDTO(g: Gift): GiftDTO {
  const info = g.itemId ? itemInfo(g.itemId) : null;
  return {
    id: g.id, kind: g.kind as GiftDTO['kind'], amount: g.amount, itemId: g.itemId,
    itemName: info?.name ?? null, itemKind: info?.kind ?? null, rarity: info?.rarity ?? null,
    reason: g.reason, source: g.source as GiftDTO['source'], createdAt: g.createdAt.toISOString(),
  };
}

/** Avisos grandes ainda não vistos (mais antigos primeiro: mostra um de cada vez). */
export async function pendingGifts(userId: string) {
  const rows = await prisma.gift.findMany({ where: { userId, popup: true, seenAt: null, OR: [{ showAt: null }, { showAt: { lte: new Date() } }] }, orderBy: { createdAt: 'asc' }, take: 20 });
  return rows.map(toGiftDTO);
}
