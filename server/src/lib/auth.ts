import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { User } from '@prisma/client';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { forbidden, unauthorized } from './http.js';

export const COOKIE_NAME = 'gb_session';
const BCRYPT_ROUNDS = 12;

export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_ROUNDS);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/** O token leva a "versão" da conta: trocar a senha ou sair de todos os aparelhos invalida os antigos. */
export function signSession(user: Pick<User, 'id' | 'tokenVersion'>) {
  return jwt.sign({ sub: user.id, v: user.tokenVersion }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: `${env.SESSION_DAYS}d` });
}

export function readSession(token: string | undefined): { id: string; v: number } | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as { sub?: string; v?: number };
    return payload.sub ? { id: payload.sub, v: payload.v ?? 0 } : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, user: Pick<User, 'id' | 'tokenVersion'>) {
  res.cookie(COOKIE_NAME, signSession(user), {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_DAYS * 86_400_000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Admin = papel ADMIN **e** e-mail igual ao ADMIN_EMAIL configurado. */
export function isAdmin(user: Pick<User, 'role' | 'email'>) {
  return user.role === 'ADMIN' && user.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const s = readSession(req.cookies?.[COOKIE_NAME]);
    if (s) {
      const user = await prisma.user.findUnique({ where: { id: s.id } });
      if (user && user.tokenVersion === s.v) req.user = user;
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!isAdmin(req.user)) return next(forbidden('Apenas o administrador pode fazer isso.'));
  next();
}
