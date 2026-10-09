import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const API = process.env.VITE_API_PROXY ?? 'http://localhost:3000';

/**
 * Política de segurança (CSP) também como <meta> no HTML de produção: algumas
 * hospedagens (ex.: a CDN da Hostinger) substituem o cabeçalho enviado pelo
 * servidor. Só no build — em desenvolvimento o Vite usa scripts inline.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const cspMeta = (): Plugin => ({
  name: 'gymbattle-csp-meta',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  plugins: [
    react(),
    tailwindcss(),
    cspMeta(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'push-sw.js'],
      manifest: {
        id: '/',
        name: 'GymBattle',
        short_name: 'GymBattle',
        description: 'Treine, poste, evolua seu guerreiro e lute na arena.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#09090b',
        theme_color: '#09090b',
        categories: ['health', 'fitness', 'games', 'social'],
        // permite ao Chrome do Android dizer se o app já está instalado
        related_applications: [{ platform: 'webapp', url: 'https://battlegym.online/manifest.webmanifest' }],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/, /^\/socket\.io/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/uploads/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'workout-photos',
              // fotos apagadas (fake ou antigas) não ficam guardadas no aparelho
              expiration: { maxEntries: 200, maxAgeSeconds: 6 * 3600 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': API,
      '/uploads': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
