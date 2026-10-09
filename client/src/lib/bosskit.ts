/**
 * Carrega o kit dos bosses do servidor (rota protegida). O código dos bosses
 * NÃO faz parte do site: só chega para quem pode ver (admin ou evento ativo).
 */
import type * as Kit from '@/bosskit';

export type BossKit = typeof Kit;

let pending: Promise<BossKit> | null = null;

export function loadBossKit(): Promise<BossKit> {
  if (!pending) {
    const url = `/api/events/kit.js?v=${Date.now().toString(36)}`;
    pending = (import(/* @vite-ignore */ url) as Promise<BossKit>).catch((e) => {
      pending = null;
      throw e;
    });
  }
  return pending;
}
