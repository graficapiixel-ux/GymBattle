import sharp from 'sharp';
import exifReader from 'exif-reader';

/** Idade máxima da foto (quando a câmera grava o fuso) e folga quando não grava. */
export const MAX_PHOTO_AGE_MS = 20 * 60_000;
const NO_OFFSET_SLACK_MS = 2 * 60 * 60_000; // fusos do Brasil variam de −2 a −5 h

function offsetMinutes(s: unknown): number | null {
  const m = typeof s === 'string' ? /^([+-])(\d{2}):?(\d{2})$/.exec(s.trim()) : null;
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * Quando a foto foi tirada (dos dados EXIF da câmera), ou null se a foto não
 * tem essa informação. `exact` = a câmera gravou o fuso horário.
 */
export async function photoTakenAt(buf: Buffer): Promise<{ at: Date; exact: boolean } | null> {
  try {
    const meta = await sharp(buf, { failOn: 'none' }).metadata();
    if (!meta.exif) return null;
    const ex = exifReader(meta.exif);
    const d = (ex.Photo?.DateTimeOriginal ?? ex.Photo?.DateTimeDigitized ?? ex.Image?.DateTime) as Date | undefined;
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    // o leitor trata a hora local da câmera como UTC: corrige pelo fuso gravado (ou o de Brasília)
    const off = offsetMinutes(ex.Photo?.OffsetTimeOriginal ?? ex.Photo?.OffsetTime);
    const minutes = off ?? -180;
    return { at: new Date(d.getTime() - minutes * 60_000), exact: off !== null };
  } catch {
    return null;
  }
}

/** A foto é antiga (tirada antes de agora)? */
export async function isOldPhoto(buf: Buffer, now = Date.now()): Promise<boolean> {
  const t = await photoTakenAt(buf);
  if (!t) return false;
  const age = now - t.at.getTime();
  return age > MAX_PHOTO_AGE_MS + (t.exact ? 0 : NO_OFFSET_SLACK_MS);
}
