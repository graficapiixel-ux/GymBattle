import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // um arquivo só: garante que boot.ts (padrões de produção) rode antes de tudo
  splitting: false,
  sourcemap: true,
  // O pacote compartilhado é TypeScript puro: embutimos no bundle.
  noExternal: ['@gymbattle/shared'],
});
