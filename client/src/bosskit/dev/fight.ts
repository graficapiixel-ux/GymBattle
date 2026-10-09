/** Desenvolvimento: renderiza quadros de uma luta (BossBattle) em tempos escolhidos. */
import type { BossReplay } from '@gymbattle/shared';
import { BossBattle } from '../battle';

declare global {
  interface Window { setupFight(r: BossReplay, w: number, h: number): void; frameAt(T: number): void; fightInfo(): unknown }
}
let b: BossBattle | null = null;
window.setupFight = (r, w, h) => {
  const c = document.createElement('canvas');
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  document.body.appendChild(c);
  b = new BossBattle(c, r, {});
  b.resize();
};
window.frameAt = (T) => {
  b!.render(T);
};
window.fightInfo = () => null;
// câmera (para medir suavidade nos testes)
(window as unknown as { camAt: (T: number) => unknown }).camAt = (T: number) => {
  const c = (b as unknown as { canvas: HTMLCanvasElement }).canvas;
  return (b as unknown as { camera(T: number, w: number, h: number): unknown }).camera(T, c.width, c.height);
};
