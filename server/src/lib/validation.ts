import { z } from 'zod';
import { cpfDigits, isValidCpf } from '@gymbattle/shared';

export const emailSchema = z
  .string({ error: 'Informe o e-mail.' })
  .trim()
  .toLowerCase()
  .max(191)
  .email('E-mail inválido.');

/** Nomes que poderiam se passar pela equipe do site. */
const RESERVED = ['admin', 'administrador', 'moderador', 'moderacao', 'suporte', 'gymbattle', 'battlegym', 'sistema', 'oficial', 'staff'];

export const usernameSchema = z
  .string({ error: 'Informe o nome de usuário.' })
  .trim()
  .min(3, 'O nome de usuário precisa ter pelo menos 3 caracteres.')
  .max(20, 'O nome de usuário pode ter no máximo 20 caracteres.')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Use apenas letras, números, "_" e ".".')
  .refine((u) => !RESERVED.some((r) => u.toLowerCase().replace(/[._\d]/g, '').includes(r)), 'Esse nome de usuário não está disponível.');

export const passwordSchema = z
  .string({ error: 'Informe a senha.' })
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(72, 'A senha pode ter no máximo 72 caracteres.');

export const cpfSchema = z
  .string({ error: 'Informe o CPF.' })
  .trim()
  .max(20)
  .refine(isValidCpf, 'CPF inválido. Confira os números.')
  .transform(cpfDigits);

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  cpf: cpfSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha.'),
});
