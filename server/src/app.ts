import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env, isProd } from './env.js';
import { loadUser } from './lib/auth.js';
import { errorHandler, forbidden, notFound } from './lib/http.js';
import rateLimit from 'express-rate-limit';
import { isShieldsEnabled, isSignupEnabled } from './lib/settings.js';
import { runHousekeeping } from './lib/housekeeping.js';
import { authRouter } from './routes/auth.js';
import { groupsRouter } from './routes/groups.js';
import { eventsRouter } from './routes/events.js';
import { adminEventsRouter } from './routes/adminEvents.js';
import { adminRouter } from './routes/admin.js';
import { meRouter } from './routes/me.js';
import { postsRouter } from './routes/posts.js';
import { usersRouter } from './routes/users.js';
import { shopRouter } from './routes/shop.js';
import { battlesRouter } from './routes/battles.js';
import { rankingRouter } from './routes/ranking.js';
import { notificationsRouter } from './routes/notifications.js';
import compression from 'compression';

const here = path.dirname(fileURLToPath(import.meta.url));
// front-end compilado: ao lado do bundle (server/dist/public) ou em client/dist
const clientDist = [path.resolve(here, 'public'), path.resolve(here, '../../client/dist'), path.resolve(process.cwd(), 'client/dist')].find((p) =>
  fs.existsSync(path.join(p, 'index.html')),
) ?? path.resolve(here, '../../client/dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // atrás do Nginx
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
          'script-src': ["'self'", "'wasm-unsafe-eval'"],
          'upgrade-insecure-requests': isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression({ filter: (req, res) => !req.path.endsWith('/replay') && compression.filter(req, res) }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Proteção extra contra CSRF: ações (POST/PUT/DELETE) só aceitas vindas do próprio site.
  const allowedOrigins = new Set([new URL(env.PUBLIC_URL).origin]);
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next(); // apps nativos/curl não mandam Origin; o cookie SameSite continua protegendo
    const self = `${req.protocol}://${req.get('host')}`;
    if (origin === self || allowedOrigins.has(origin)) return next();
    next(forbidden('Origem não permitida.'));
  });

  // Limite geral por usuário/IP (evita abuso em rotas sem limite próprio)
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: process.env.NODE_ENV === 'test' ? 100_000 : 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Muitas requisições. Espere um pouco.', code: 'RATE_LIMIT' },
    }),
  );
  app.use('/api', loadUser);

  // API
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // chamado pelo cron da hospedagem a cada 10 min (acorda o app e roda as tarefas; sem efeito se repetido)
  app.get('/api/tick', (_req, res) => {
    void runHousekeeping();
    res.json({ ok: true });
  });
  app.get('/api/config', async (_req, res) => {
    res.json({ signupEnabled: await isSignupEnabled(), shieldsEnabled: await isShieldsEnabled() });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/shop', shopRouter);
  app.use('/api/battles', battlesRouter);
  app.use('/api/ranking', rankingRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/admin/events', adminEventsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', (_req, _res, next) => next(notFound('Rota não encontrada.')));

  // Fotos enviadas
  app.use(
    '/uploads',
    express.static(path.resolve(env.UPLOAD_DIR), {
      maxAge: '1h',
      fallthrough: false,
      dotfiles: 'deny',
      index: false,
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    }),
  );

  // Front-end compilado (produção)
  if (fs.existsSync(clientDist)) {
    app.use(
      express.static(clientDist, {
        setHeaders(res, file) {
          if (file.endsWith('sw.js') || file.endsWith('.html') || file.endsWith('.webmanifest')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (file.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get(/^\/(?!api|uploads|socket\.io).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
