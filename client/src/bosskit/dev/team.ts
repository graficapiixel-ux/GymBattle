/** Desenvolvimento: renderiza quadros de uma luta em equipe (TeamBattle) em tempos escolhidos. */
import type { TeamReplay } from '@gymbattle/shared';
import { TeamBattle } from '../team';

declare global {
  interface Window { setupTeam(r: TeamReplay, w: number, h: number): void; teamFrame(T: number): void }
}
let b: TeamBattle | null = null;
window.setupTeam = (r, w, h) => {
  const c = document.createElement('canvas');
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  document.body.appendChild(c);
  b = new TeamBattle(c, r, { sound: false });
  b.resize();
};
window.teamFrame = (T) => {
  b!.seek(T);
};
