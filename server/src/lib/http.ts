import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const badRequest = (msg: string, code?: string) => new HttpError(400, msg, code);
export const unauthorized = (msg = 'Faça login para continuar.') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'Acesso negado.') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Não encontrado.') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string, code?: string) => new HttpError(409, msg, code);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: first?.message ?? 'Dados inválidos.', code: 'VALIDATION' });
  }
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Não foi possível enviar essa foto. Tente outra.' : 'Erro no envio do arquivo.';
    return res.status(413).json({ error: msg, code: err.code });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  // erros do próprio Express (JSON malformado, corpo grande demais…)
  const e = err as { status?: number; expose?: boolean; type?: string };
  if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500 && e.expose) {
    const msg = e.type === 'entity.too.large' ? 'Requisição grande demais.' : 'Requisição inválida.';
    return res.status(e.status).json({ error: msg, code: 'BAD_REQUEST' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.', code: 'INTERNAL' });
}
