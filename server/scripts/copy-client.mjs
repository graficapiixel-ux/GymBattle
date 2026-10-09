// Copia o front-end compilado para server/dist/public (o servidor serve daqui).
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const from = path.resolve(root, '../client/dist');
const to = path.resolve(root, 'dist/public');
if (!fs.existsSync(path.join(from, 'index.html'))) {
  console.warn('client/dist não encontrado — rode o build do cliente antes (npm run build na raiz).');
  process.exit(0);
}
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log('Front-end copiado para server/dist/public');
