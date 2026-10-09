import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  ATTRIBUTES, BALANCE, DEFAULT_AVATAR, clampHeight, respecCost, type AttributeKey,
  FACE_STYLES, HAIR_STYLES, BEARD_STYLES, BODY_TYPES, GENDERS, EYE_COLORS, MARKS, ACCESSORIES, OUTFIT_COLORS } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { pendingGifts } from '../lib/gifts.js';
import multer from 'multer';
import { cpfHash } from '../lib/users.js';
import { deleteImage, processAvatar, saveAvatar } from '../lib/images.js';

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});
const photoLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
  keyGenerator: (req) => req.user!.id,
  message: { error: 'Muitas trocas de foto nesta hora. Tente mais tarde.', code: 'RATE_LIMIT' },
});
const cpfLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 15,
  keyGenerator: (req) => req.user!.id,
  message: { error: 'Muitas tentativas. Tente de novo mais tarde.', code: 'RATE_LIMIT' },
});
import rateLimit from 'express-rate-limit';
import { hashPassword, requireAuth, setSessionCookie, verifyPassword } from '../lib/auth.js';
import { badRequest, conflict } from '../lib/http.js';
import { cpfSchema, passwordSchema } from '../lib/validation.js';
import { avatarOf, toMe } from '../lib/serialize.js';

export const meRouter = Router();
meRouter.use(requireAuth);

const allocSchema = z.object(
  Object.fromEntries(ATTRIBUTES.map((k) => [k, z.number().int().min(0).max(60).default(0)])) as Record<
    AttributeKey,
    z.ZodDefault<z.ZodNumber>
  >,
);

/**
 * CPF de quem já tinha conta: confirma UMA vez (precisa ser válido e não
 * pode estar em outra conta). Depois de confirmado, não muda mais.
 */
meRouter.post('/cpf', cpfLimiter, async (req, res) => {
  const { cpf } = z.object({ cpf: cpfSchema }).parse(req.body);
  const me = req.user!;
  if (me.cpfHash) throw conflict('Seu CPF já foi confirmado e não pode ser trocado.', 'CPF_LOCKED');
  const h = cpfHash(cpf);
  const other = await prisma.user.findUnique({ where: { cpfHash: h }, select: { id: true } });
  if (other) throw conflict('Este CPF já está em outra conta. Cada pessoa só pode ter uma conta.', 'CPF_TAKEN');
  try {
    // só grava se ainda não tinha (evita trocar com dois cliques ao mesmo tempo)
    const r = await prisma.user.updateMany({ where: { id: me.id, cpfHash: null }, data: { cpfHash: h, cpfLast2: cpf.slice(-2) } });
    if (!r.count) throw conflict('Seu CPF já foi confirmado e não pode ser trocado.', 'CPF_LOCKED');
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw conflict('Este CPF já está em outra conta. Cada pessoa só pode ter uma conta.', 'CPF_TAKEN');
    }
    throw e;
  }
  const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  res.json({ user: toMe(u) });
});

/** Foto de perfil (pode vir da galeria). */
meRouter.post('/photo', photoLimiter, avatarUpload.single('photo'), async (req, res) => {
  if (!req.file) throw badRequest('Escolha uma foto.');
  const data = await processAvatar(req.file.buffer);
  const rel = await saveAvatar(req.user!.id, data);
  const old = req.user!.photoPath;
  const u = await prisma.user.update({ where: { id: req.user!.id }, data: { photoPath: rel } });
  if (old) await deleteImage(old).catch(() => {});
  res.json({ user: toMe(u) });
});

meRouter.delete('/photo', async (req, res) => {
  const old = req.user!.photoPath;
  const u = await prisma.user.update({ where: { id: req.user!.id }, data: { photoPath: null } });
  if (old) await deleteImage(old).catch(() => {});
  res.json({ user: toMe(u) });
});

/** Presentes com aviso ainda não vistos (o app mostra um de cada vez). */
meRouter.get('/gifts', async (req, res) => {
  res.json({ gifts: await pendingGifts(req.user!.id) });
});

meRouter.post('/gifts/:id/seen', async (req, res) => {
  await prisma.gift.updateMany({ where: { id: String(req.params.id), userId: req.user!.id, seenAt: null }, data: { seenAt: new Date() } });
  res.json({ ok: true });
});

meRouter.post('/attributes', async (req, res) => {
  const alloc = allocSchema.parse(req.body);
  const u = req.user!;
  const spend = ATTRIBUTES.reduce((s, k) => s + alloc[k], 0);
  if (spend <= 0) throw badRequest('Escolha pelo menos um ponto para distribuir.');
  if (spend > u.attrPoints) throw badRequest('Você não tem pontos suficientes.');
  for (const k of ATTRIBUTES) {
    if (u[k] + alloc[k] > BALANCE.attributes.max) {
      throw badRequest(`Limite de ${BALANCE.attributes.max} por atributo.`);
    }
  }
  // Atualização condicional evita gastar o mesmo ponto duas vezes em requisições simultâneas.
  const result = await prisma.user.updateMany({
    // o limite por atributo também é conferido no banco (requisições simultâneas)
    where: {
      id: u.id,
      attrPoints: { gte: spend },
      ...Object.fromEntries(ATTRIBUTES.filter((k) => alloc[k] > 0).map((k) => [k, { lte: BALANCE.attributes.max - alloc[k] }])),
    },
    data: {
      attrPoints: { decrement: spend },
      ...Object.fromEntries(ATTRIBUTES.map((k) => [k, { increment: alloc[k] }])),
    },
  });
  if (result.count === 0) throw badRequest('Você não tem pontos suficientes.');
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  res.json({ user: toMe(updated) });
});

/** Informações da redistribuição (custo, disponibilidade). */
meRouter.get('/respec', (req, res) => {
  const u = req.user!;
  const cost = respecCost(u.level, u.respecCount);
  const cooldownMs = BALANCE.attributes.respec.cooldownHours * 3_600_000;
  const availableAt = u.lastRespecAt ? new Date(u.lastRespecAt.getTime() + cooldownMs) : null;
  const spent = ATTRIBUTES.reduce((s, k) => s + (u[k] - BALANCE.attributes.start), 0);
  res.json({
    cost,
    spentPoints: spent,
    availableAt: availableAt && availableAt > new Date() ? availableAt.toISOString() : null,
  });
});

/** Redistribuição de pontos ("Larva"): devolve os pontos gastos, custa ouro. */
meRouter.post('/respec', async (req, res) => {
  const u = req.user!;
  const cost = respecCost(u.level, u.respecCount);
  const cooldownMs = BALANCE.attributes.respec.cooldownHours * 3_600_000;
  if (u.lastRespecAt && Date.now() - u.lastRespecAt.getTime() < cooldownMs) {
    throw badRequest('Você só pode redistribuir os pontos uma vez a cada 24 horas.');
  }
  const start = BALANCE.attributes.start;
  const spent = ATTRIBUTES.reduce((s, k) => s + (u[k] - start), 0);
  if (spent <= 0) throw badRequest('Você não tem pontos distribuídos para resetar.');
  if (u.gold < cost) throw badRequest(`Você precisa de ${cost} de ouro para redistribuir.`);

  const result = await prisma.user.updateMany({
    where: { id: u.id, gold: { gte: cost }, respecCount: u.respecCount },
    data: {
      gold: { decrement: cost },
      attrPoints: { increment: spent },
      respecCount: { increment: 1 },
      lastRespecAt: new Date(),
      ...Object.fromEntries(ATTRIBUTES.map((k) => [k, start])),
    },
  });
  if (result.count === 0) throw badRequest('Não foi possível redistribuir. Tente novamente.');
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  res.json({ user: toMe(updated), cost, refunded: spent });
});

/** Aparência do avatar (o editor completo chega na Fase 3). */
meRouter.put('/avatar', async (req, res) => {
  const look = z
    .object({
      skin: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      face: z.number().int().min(0).max(FACE_STYLES.length - 1),
      hair: z.number().int().min(0).max(HAIR_STYLES.length - 1),
      hairColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      beard: z.number().int().min(0).max(BEARD_STYLES.length - 1),
      body: z.number().int().min(0).max(BODY_TYPES.length - 1),
      height: z.number(),
      gender: z.number().int().min(0).max(GENDERS.length - 1),
      // cores só da lista oficial
      eyes: z.string().refine((c) => EYE_COLORS.includes(c), 'Cor inválida.'),
      marks: z.number().int().min(0).max(MARKS.length - 1),
      accessory: z.number().int().min(0).max(ACCESSORIES.length - 1),
      top: z.string().refine((c) => OUTFIT_COLORS.includes(c), 'Cor inválida.'),
      shorts: z.string().refine((c) => OUTFIT_COLORS.includes(c), 'Cor inválida.'),
    })
    .partial()
    .parse(req.body);
  const next = { ...DEFAULT_AVATAR, ...avatarOf(req.user!), ...look };
  next.height = Math.round(clampHeight(next.height) * 100) / 100;
  if (next.gender === 1) next.beard = 0; // personagem feminina não usa barba
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: { avatar: next as unknown as Prisma.InputJsonValue },
  });
  res.json({ user: toMe(updated) });
});

const passwordLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 5,
  keyGenerator: (req) => req.user!.id,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.', code: 'RATE_LIMIT' },
});

/** Trocar a própria senha: desconecta todos os outros aparelhos (este continua logado). */
meRouter.post('/password', passwordLimiter, async (req, res) => {
  const { current, next } = z.object({ current: z.string().min(1, 'Informe a senha atual.'), next: passwordSchema }).parse(req.body);
  if (!(await verifyPassword(current, req.user!.passwordHash))) throw badRequest('Senha atual incorreta.');
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: { passwordHash: await hashPassword(next), tokenVersion: { increment: 1 } },
  });
  setSessionCookie(res, updated);
  res.json({ ok: true });
});
