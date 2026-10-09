// Gera os ícones PNG do PWA a partir de public/favicon.svg (npm run icons -w client)
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const svg = fs.readFileSync(path.join(root, 'public/favicon.svg'));
const out = path.join(root, 'public/icons');
fs.mkdirSync(out, { recursive: true });

await sharp(svg).resize(192, 192).png().toFile(path.join(out, 'icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(path.join(out, 'icon-512.png'));
await sharp(svg).resize(180, 180).flatten({ background: '#C8FF3D' }).png().toFile(path.join(out, 'apple-touch-icon.png'));

// Maskable: ícone menor centralizado em fundo sólido (zona segura de 80%)
const inner = await sharp(svg).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#C8FF3D' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(path.join(out, 'icon-maskable-512.png'));

console.log('Ícones gerados em', out);
