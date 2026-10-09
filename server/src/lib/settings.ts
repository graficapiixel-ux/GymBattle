import { prisma } from '../db.js';

const DEFAULTS = {
  signupEnabled: 'true',
  /** Escudos (proteção de 36 h depois de perder PR numa luta). Começa desligado. */
  shieldsEnabled: 'false',
} as const;

type Key = keyof typeof DEFAULTS;

export async function getSetting(key: Key): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key];
}

export async function setSetting(key: Key, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function isShieldsEnabled() {
  return (await getSetting('shieldsEnabled')) === 'true';
}

/** Tira o escudo de todo mundo (usado quando os escudos estão desligados). */
export async function clearAllShields() {
  const r = await prisma.user.updateMany({ where: { protectedUntil: { not: null } }, data: { protectedUntil: null } });
  return r.count;
}

export async function isSignupEnabled() {
  return (await getSetting('signupEnabled')) === 'true';
}

/** Chaves internas (não expostas pela API). */
export async function getSettingRaw(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSettingRaw(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
