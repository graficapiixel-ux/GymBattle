// padrões de produção (NODE_ENV, pasta das fotos) ANTES de ler as variáveis
import './boot.js';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  PUBLIC_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres')
    .refine((s) => !/troque-isto|ci-secret|changeme|secret-secret/i.test(s) && new Set(s).size >= 12, 'JWT_SECRET inseguro: use um texto aleatório (veja .env.example)'),
  SESSION_DAYS: z.coerce.number().default(30),
  // segredo do "hash" do CPF (opcional: se faltar, é derivado do JWT_SECRET)
  CPF_SECRET: z.string().min(32, 'CPF_SECRET precisa ter pelo menos 32 caracteres').optional(),
  ADMIN_EMAIL: z.string().email().default('lucasmartins2216@gmail.com'),
  UPLOAD_DIR: z.string().default('./uploads'),
  // em produção o cookie é "Secure" (só HTTPS) a menos que COOKIE_SECURE=false
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? process.env.NODE_ENV === 'production' : v === 'true')),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
