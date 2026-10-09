import sharp, { type Metadata } from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BALANCE } from '@gymbattle/shared';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { badRequest, HttpError } from './http.js';

// Hospedagem compartilhada: pouca memória. Sem cache e um processamento por vez.
sharp.cache(false);
sharp.concurrency(1);
/**
 * Máximo de pixels aceitos. JPEG/WebP/HEIF são reduzidos já na leitura
 * (gasta pouca memória), então aceitam fotos enormes de celular (até 300 MP).
 * PNG/GIF precisam ser lidos inteiros: limite menor contra "bombas" de descompressão.
 */
const LIMIT_PIXELS = 300_000_000;
const LIMIT_PIXELS_FULL_DECODE = 120_000_000;

let busy = 0;
const queue: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (busy >= 2) {
    if (queue.length > 20) throw new HttpError(503, 'Servidor ocupado. Tente enviar a foto de novo em instantes.', 'BUSY');
    await new Promise<void>((r) => queue.push(r));
  }
  busy++;
  try {
    return await fn();
  } finally {
    busy--;
    queue.shift()?.();
  }
}

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
  hash: bigint;
}

/**
 * Hash perceptual (dHash de 64 bits): compara o brilho de pixels vizinhos numa
 * miniatura 9×8 em tons de cinza. Imagens iguais (mesmo recomprimidas ou
 * redimensionadas) geram hashes quase idênticos.
 */
export async function perceptualHash(input: Buffer): Promise<bigint> {
  const px = await sharp(input, { limitInputPixels: LIMIT_PIXELS }).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return BigInt.asIntN(64, hash); // BIGINT com sinal no MySQL
}

/**
 * Corrige a rotação, redimensiona, converte para WebP e REMOVE todos os metadados
 * (EXIF, GPS, modelo do celular...). O sharp só mantém metadados se pedirmos com
 * .withMetadata(), o que nunca fazemos.
 */
export function processUpload(input: Buffer): Promise<ProcessedImage> {
  return withSlot(() => processImage(input));
}

async function processImage(input: Buffer): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: LIMIT_PIXELS }).metadata();
  } catch {
    throw badRequest('Arquivo de imagem inválido.');
  }
  const pixels = (meta.width ?? 0) * (meta.height ?? 0);
  const cheapDecode = meta.format === 'jpeg' || meta.format === 'webp' || meta.format === 'heif';
  if (pixels > (cheapDecode ? LIMIT_PIXELS : LIMIT_PIXELS_FULL_DECODE)) throw badRequest('Não foi possível abrir essa imagem. Tente outra foto.');
  if (!meta.format || !['jpeg', 'png', 'webp', 'heif', 'avif', 'gif'].includes(meta.format)) {
    throw badRequest('Formato não suportado. Envie JPG, PNG ou WebP.');
  }
  const max = BALANCE.post.maxImageSize;
  const { data, info } = await sharp(input, { failOn: 'error', limitInputPixels: LIMIT_PIXELS, sequentialRead: true })
    .rotate()
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: BALANCE.post.webpQuality })
    .toBuffer({ resolveWithObject: true });
  if (info.width < 200 || info.height < 200) throw badRequest('Imagem muito pequena.');
  // hash calculado da versão já reduzida (bem mais leve; a rotação já foi aplicada)
  const hash = await perceptualHash(data);
  return { data, width: info.width, height: info.height, hash };
}

/** Existe alguma foto (mesmo apagada) com hash parecido? */
export async function isDuplicate(hash: bigint): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM PhotoHash WHERE BIT_COUNT(hash ^ CAST(${hash.toString()} AS SIGNED)) <= ${BALANCE.post.duplicateHashDistance} LIMIT 1`;
  return rows.length > 0;
}

export function uploadRoot() {
  return path.resolve(env.UPLOAD_DIR);
}

export async function saveImage(id: string, data: Buffer): Promise<string> {
  const month = new Date().toISOString().slice(0, 7);
  const rel = `posts/${month}/${id}.webp`;
  const abs = path.join(uploadRoot(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return rel;
}

export async function deleteImage(rel: string) {
  const abs = path.join(uploadRoot(), rel);
  if (!abs.startsWith(uploadRoot())) return;
  await fs.rm(abs, { force: true });
}

/** Foto de perfil: quadrada 320×320, WebP, sem metadados. */
export function processAvatar(input: Buffer): Promise<Buffer> {
  return withSlot(async () => {
    let meta: Metadata;
    try {
      meta = await sharp(input, { limitInputPixels: LIMIT_PIXELS }).metadata();
    } catch {
      throw badRequest('Arquivo de imagem inválido.');
    }
    if (!meta.format || !['jpeg', 'png', 'webp', 'heif', 'avif', 'gif'].includes(meta.format)) {
      throw badRequest('Formato não suportado. Envie JPG, PNG ou WebP.');
    }
    const pixels = (meta.width ?? 0) * (meta.height ?? 0);
    const cheapDecode = meta.format === 'jpeg' || meta.format === 'webp' || meta.format === 'heif';
    if (pixels > (cheapDecode ? LIMIT_PIXELS : LIMIT_PIXELS_FULL_DECODE)) throw badRequest('Não foi possível abrir essa imagem. Tente outra foto.');
    return sharp(input, { failOn: 'error', limitInputPixels: LIMIT_PIXELS, sequentialRead: true })
      .rotate()
      .resize(320, 320, { fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer();
  });
}

export async function saveAvatar(userId: string, data: Buffer): Promise<string> {
  const rel = `avatars/${userId}-${Date.now().toString(36)}.webp`;
  const abs = path.join(uploadRoot(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return rel;
}
