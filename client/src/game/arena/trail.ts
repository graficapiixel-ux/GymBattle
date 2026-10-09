/**
 * Rastro do golpe: uma fita curva que segue EXATAMENTE o caminho que a arma
 * percorreu no golpe (amostrado bem de perto), larga e forte perto da arma e
 * afinando/sumindo para trás. Sem linhas retas: é o desenho do movimento.
 */
import type { AvatarLook, WeaponDef } from '@gymbattle/shared';
import { weaponTip } from '../rig';
import { attackPose, type AttackTiming, type Motion } from './poses';

type Shape = Parameters<typeof attackPose>[0];

export interface TrailOpts {
  look: AvatarLook;
  weapon: WeaponDef | undefined;
  shape: Shape;
  motion: Motion;
  hits: number;
  timing: AttackTiming;
  /** Ticks desde o início do ataque. */
  local: number;
  /** Posição e lado do lutador num instante do ataque (em ticks locais). */
  origin: (lt: number) => { x: number; y: number; facing: 1 | -1 };
  color: string;
  low?: boolean;
}

export function drawSwingTrail(ctx: CanvasRenderingContext2D, o: TrailOpts) {
  const { windup: W, active: A } = o.timing;
  const start = W - 0.6;
  const end = W + A + 0.5;
  if (o.local < start || o.local > end + 5) return;
  const now = Math.min(o.local, end);
  // o rastro some depois do golpe
  const fade = o.local > end ? 1 - (o.local - end) / 5 : 1;
  const span = Math.max(1.5, Math.min(now - start, 5));
  const step = o.low ? 0.25 : 0.1;
  const tips: { x: number; y: number }[] = [];
  const inner: { x: number; y: number }[] = [];
  for (let lt = now; lt >= now - span - 1e-6; lt -= step) {
    const pose = attackPose(o.shape, o.motion, o.hits, o.timing, lt, 0);
    const g = o.origin(lt);
    const w = weaponTip(o.look, o.weapon, pose, g.facing);
    tips.push({ x: g.x + w.tip.x, y: g.y + w.tip.y });
    inner.push({ x: g.x + w.hand.x + (w.tip.x - w.hand.x) * 0.3, y: g.y + w.hand.y + (w.tip.y - w.hand.y) * 0.3 });
  }
  const n = tips.length;
  if (n < 3) return;
  // o quanto a ponta andou: golpe parado não deixa rastro
  let travel = 0;
  for (let i = 1; i < n; i++) travel += Math.hypot(tips[i].x - tips[i - 1].x, tips[i].y - tips[i - 1].y);
  if (travel < 12) return;

  // borda de dentro: começa perto da mão (fita larga) e vai encostando na ponta (afina)
  const edge = tips.map((p, i) => {
    const k = Math.pow(1 - i / (n - 1), 0.8);
    return { x: p.x + (inner[i].x - p.x) * k, y: p.y + (inner[i].y - p.y) * k };
  });

  // caminho suave (curvas passando pelos pontos médios)
  const smooth = (pts: { x: number; y: number }[], first: boolean) => {
    if (first) ctx.moveTo(pts[0].x, pts[0].y);
    else ctx.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  };
  const head = tips[0];
  const tail = tips[n - 1];
  const layer = (col: string, alpha: number, widthK: number) => {
    const e = tips.map((p, i) => ({ x: p.x + (edge[i].x - p.x) * widthK, y: p.y + (edge[i].y - p.y) * widthK }));
    const g = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
    g.addColorStop(0, col);
    g.addColorStop(1, col + '00');
    ctx.globalAlpha = fade * alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    smooth(tips, true);
    smooth([...e].reverse(), false);
    ctx.closePath();
    ctx.fill();
  };
  ctx.save();
  if (!o.low) {
    ctx.shadowColor = o.color;
    ctx.shadowBlur = 10;
  }
  layer(o.color, 0.4, 1); // cor do elemento, larga e semitransparente
  ctx.shadowBlur = 0;
  layer('#ffffff', 0.2, 0.3); // brilho leve junto do fio da arma
  ctx.restore();
}
