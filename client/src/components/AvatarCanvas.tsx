import { useEffect, useRef } from 'react';
import { hitboxFor, WEAPONS_BY_ID, type AvatarLook, type Equipment, type WeaponDef } from '@gymbattle/shared';
import { drawAvatar, drawWeapon, idlePose, weaponShape } from '@/game/rig';

/** Avatar animado (respirando). `size` = altura do quadro em px. */
export function AvatarCanvas({
  look, equipment, size = 220, animate = true, showHitbox = false, className, facing = 1, ground = true,
}: {
  look: AvatarLook; equipment: Equipment; size?: number; animate?: boolean; showHitbox?: boolean;
  className?: string; facing?: 1 | -1; ground?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.round(size * 0.9);

  useEffect(() => {
    const canvas = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d')!;
    const weapon = equipment.weapon ? WEAPONS_BY_ID[equipment.weapon] : undefined;
    const shape = weaponShape(weapon);
    const k = size / 175; // folga para armas longas e chapéus
    let raf = 0;
    const start = performance.now();
    const hb = hitboxFor(1);

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, size);
      ctx.save();
      ctx.translate(width / 2, size - 14 * k);
      if (ground) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 26 * k, 5 * k, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.scale(k, k);
      drawAvatar(ctx, {
        look, equipment, pose: idlePose(shape, animate ? t : 0), time: t, facing,
        showHitbox: showHitbox ? { w: hb.w, h: hb.h } : null,
      });
      ctx.restore();
      if (animate) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [look, equipment, size, width, animate, showHitbox, facing, ground]);

  return <canvas ref={ref} className={className} style={{ width, height: size }} aria-hidden />;
}

/** Ícone estático de uma arma. */
export function WeaponIcon({ weapon, size = 72, className }: { weapon: WeaponDef; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const shape = weaponShape(weapon);
    const len: Record<string, number> = {
      sword: 58, greatsword: 82, katana: 72, dagger: 30, axe: 62, hammer: 64, spear: 104, scythe: 90, bow: 64, staff: 90, seal: 26, fist: 20,
    };
    const L = len[shape] ?? 60;
    const k = (size * 0.9) / L;
    ctx.translate(size / 2, size / 2);
    ctx.rotate(shape === 'bow' || shape === 'seal' ? 0 : Math.PI / 4);
    ctx.scale(k, k);
    ctx.translate(shape === 'bow' ? -4 : shape === 'seal' ? -3 : 0, shape === 'bow' || shape === 'seal' ? (shape === 'seal' ? 4 : 0) : L / 2 - 6);
    drawWeapon(ctx, weapon, 0.6);
  }, [weapon, size]);
  return <canvas ref={ref} className={className} style={{ width: size, height: size }} aria-hidden />;
}

/** Busto do avatar (cabeça e ombros) para fotos de perfil redondas. Estático. */
export function AvatarBust({ look, equipment, size = 40, className }: { look: AvatarLook; equipment: Equipment; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const k = size / 46;
    const h = 1;
    ctx.translate(size / 2 - 2 * k, size / 2 + 78 * k * h);
    ctx.scale(k, k);
    const shape = weaponShape(equipment.weapon ? WEAPONS_BY_ID[equipment.weapon] : undefined);
    drawAvatar(ctx, { look, equipment: { ...equipment, weapon: null }, pose: { ...idlePose(shape, 0), armF: [0.1, 0.2], armB: [-0.1, 0.2] } });
  }, [look, equipment, size]);
  return <canvas ref={ref} className={className} style={{ width: size, height: size }} aria-hidden />;
}
