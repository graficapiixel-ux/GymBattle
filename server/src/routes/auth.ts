import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { clearSessionCookie, requireAuth, setSessionCookie, verifyPassword } from '../lib/auth.js';
import { forbidden, unauthorized } from '../lib/http.js';
import { toMe } from '../lib/serialize.js';
import { isSignupEnabled } from '../lib/settings.js';
import { createUser } from '../lib/users.js';
import { loginSchema, registerSchema } from '../lib/validation.js';

export const authRouter = Router();

const TEST = process.env.NODE_ENV === 'test';

/** Por IP: login. */
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: TEST ? 1000 : 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.', code: 'RATE_LIMIT' },
});

/** Por conta: impede adivinhar a senha de UMA conta usando vários IPs. Acertos não contam. */
const loginAccountLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: TEST ? 1000 : 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => 'acct:' + String((req.body as { email?: unknown })?.email ?? '').trim().toLowerCase().slice(0, 191),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login nesta conta. Tente de novo em 1 hora.', code: 'RATE_LIMIT' },
});

// Criação de contas por IP: limite FOLGADO (academias e casas dividem a mesma
// internet), mas sem limite nenhum dava para criar contas em massa com CPFs
// gerados e para testar se um CPF já está cadastrado.
const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: TEST ? 1000 : 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas contas criadas daqui. Tente mais tarde.', code: 'RATE_LIMIT' },
});
/** Tentativas que deram erro (CPF/e-mail já usados...) contam mais apertado. */
const registerFailLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: TEST ? 1000 : 15,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de cadastro. Tente mais tarde.', code: 'RATE_LIMIT' },
});

// Hash fixo para gastar o mesmo tempo quando o e-mail não existe (evita enumeração por tempo).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

authRouter.post('/register', registerLimiter, registerFailLimiter, async (req, res) => {
  if (!(await isSignupEnabled())) throw forbidden('A criação de contas está desativada no momento.');
  const data = registerSchema.parse(req.body);
  const user = await createUser(data);
  setSessionCookie(res, user);
  res.status(201).json({ user: toMe(user) });
});

authRouter.post('/login', loginIpLimiter, loginAccountLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('E-mail ou senha incorretos.');
  setSessionCookie(res, user);
  res.json({ user: toMe(user) });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Sair de todos os aparelhos: invalida todas as sessões desta conta. */
authRouter.post('/logout-all', requireAuth, async (req, res) => {
  await prisma.user.update({ where: { id: req.user!.id }, data: { tokenVersion: { increment: 1 } } });
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? toMe(req.user) : null });
});
