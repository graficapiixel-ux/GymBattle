import clsx from 'clsx';
import { Coins, Zap, Droplet } from 'lucide-react';
import {
  ATTRIBUTE_LABELS, ELEMENT_COLOR, ELEMENT_LABEL, RARITY_COLOR, RARITY_LABEL,
  type AttackDef, type AttributeKey, type Grade, type Rarity, type WeaponDef,
} from '@gymbattle/shared';
import { nf } from '@/lib/format';

export function RarityTag({ rarity, className }: { rarity: Rarity; className?: string }) {
  return (
    <span
      className={clsx('inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-bold uppercase tracking-wide', className)}
      style={{ color: RARITY_COLOR[rarity], background: RARITY_COLOR[rarity] + '1f' }}
    >
      {RARITY_LABEL[rarity]}
    </span>
  );
}

export function Price({ value, className, muted, inherit }: { value: number; className?: string; muted?: boolean; inherit?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 font-display font-semibold tabular-nums', inherit ? '' : muted ? 'text-muted' : 'text-gold', className)}>
      <Coins className="size-3.5" />
      {nf.format(value)}
    </span>
  );
}

export function ElementTag({ el }: { el: WeaponDef['element'] }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <span className="size-2 rounded-full" style={{ background: ELEMENT_COLOR[el] }} />
      {ELEMENT_LABEL[el]}
    </span>
  );
}

export function Requirements({ req, attrs }: { req: WeaponDef['requirements']; attrs?: Record<AttributeKey, number> }) {
  const entries = Object.entries(req) as [AttributeKey, number][];
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, n]) => {
        const ok = !attrs || attrs[k] >= n;
        return (
          <span
            key={k}
            className={clsx(
              'inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-semibold tabular-nums',
              ok ? 'bg-surface-3 text-fg' : 'bg-danger/15 text-danger',
            )}
            title={ATTRIBUTE_LABELS[k].name}
          >
            {ATTRIBUTE_LABELS[k].short} {n}
            {attrs && !ok && <span className="font-normal opacity-80">({attrs[k]})</span>}
          </span>
        );
      })}
    </div>
  );
}

export function Scaling({ scaling }: { scaling: WeaponDef['scaling'] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.entries(scaling) as [AttributeKey, Grade][]).map(([k, g]) => (
        <span key={k} className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-3 px-2 text-xs">
          <span className="text-muted">{ATTRIBUTE_LABELS[k].short}</span>
          <b className={clsx(g === 'S' ? 'text-gold' : g === 'A' ? 'text-volt' : 'text-fg')}>{g}</b>
        </span>
      ))}
    </div>
  );
}

export function AttackRow({ slot, a }: { slot: 1 | 2; a: AttackDef }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md bg-volt/15 text-[11px] font-bold text-volt">A{slot}</span>
        <p className="text-sm font-semibold">{a.name}</p>
        <div className="ml-auto flex gap-2 text-xs tabular-nums">
          {a.stamina > 0 && (
            <span className="inline-flex items-center gap-0.5 text-stamina">
              <Zap className="size-3" />
              {a.stamina}
            </span>
          )}
          {a.mana > 0 && (
            <span className="inline-flex items-center gap-0.5 text-mana">
              <Droplet className="size-3" />
              {a.mana}
            </span>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted">{a.desc}</p>
    </div>
  );
}
