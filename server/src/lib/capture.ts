import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

/**
 * "Senha" de foto tirada na hora: o app pede uma quando abre a câmera e manda
 * junto com a foto. Sem ela (ou vencida, ou de outra pessoa, ou já usada) o
 * post é recusado — assim ninguém posta foto da galeria/internet pelo app.
 */
export const CAPTURE_TTL_MS = 15 * 60_000;

const used = new Map<string, number>(); // nonce → quando vence

function sign(payload: string) {
  return createHmac('sha256', `${env.JWT_SECRET}:capture`).update(payload).digest('base64url');
}

export function issueCaptureToken(userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: userId, t: now, n: randomBytes(9).toString('base64url') })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Valida e consome a senha. Retorna o motivo da recusa ou null se está ok. */
export function consumeCaptureToken(token: string | undefined, userId: string, now = Date.now()): string | null {
  if (!token || token.length > 400) return 'missing';
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return 'invalid';
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return 'invalid';
  let data: { u: string; t: number; n: string };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return 'invalid';
  }
  if (data.u !== userId) return 'invalid';
  if (now - data.t > CAPTURE_TTL_MS || data.t > now + 60_000) return 'expired';
  for (const [n, exp] of used) if (exp < now) used.delete(n);
  if (used.has(data.n)) return 'used';
  used.set(data.n, data.t + CAPTURE_TTL_MS);
  return null;
}
