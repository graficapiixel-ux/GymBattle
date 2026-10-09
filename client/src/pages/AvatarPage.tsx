import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Ruler, Scan, Save, RotateCcw, ChevronRight, Plus } from 'lucide-react';
import {
  ARMOR_SLOTS, ARMOR_SLOT_LABEL, BEARD_STYLES, BODY_TYPES, FACE_STYLES, HAIR_COLORS, HAIR_STYLES, SKIN_TONES,
  GENDERS, EYE_COLORS, MARKS, ACCESSORIES, OUTFIT_COLORS, DEFAULT_AVATAR,
  WEAPONS_BY_ID, hitboxFor, parseArmorPieceId,
  type AvatarLook, type EquipSlot, type MeUser,
} from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useInventory } from '@/lib/inventory';
import { AvatarCanvas, WeaponIcon } from '@/components/AvatarCanvas';
import { RarityTag } from '@/components/ItemBits';
import { Button, Card, Sheet, toast } from '@/components/ui';

export default function AvatarPage() {
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState<'look' | 'gear'>('look');
  const [look, setLook] = useState<AvatarLook | null>(user ? { ...DEFAULT_AVATAR, ...user.avatar } : null);
  const [hitbox, setHitbox] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (user && !look) setLook({ ...DEFAULT_AVATAR, ...user.avatar });
  }, [user, look]);
  if (!user || !look) return null;
  const dirty = JSON.stringify(look) !== JSON.stringify({ ...DEFAULT_AVATAR, ...user.avatar });
  const hb = hitboxFor(1);
  const set = <K extends keyof AvatarLook>(k: K, val: AvatarLook[K]) => setLook({ ...look, [k]: val });

  async function save() {
    setSaving(true);
    try {
      const r = await api.put<{ user: MeUser }>('/me/avatar', look);
      setUser(r.user);
      setLook(r.user.avatar);
      toast('Aparência salva!');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-4">
      <Card className="sticky top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-20 overflow-hidden bg-surface/95 backdrop-blur">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_85%,rgb(200_255_61/0.12),transparent_60%)]" />
        <div className="relative flex justify-center pt-1">
          <AvatarCanvas size={window.innerHeight < 760 ? 190 : 240} look={look} equipment={user.equipment} showHitbox={hitbox} />
        </div>
        <div className="relative flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Ruler className="size-3.5" /> Hitbox {Math.round(hb.w)}×{Math.round(hb.h)} · igual para todos
          </span>
          <button
            onClick={() => setHitbox((h) => !h)}
            className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold', hitbox ? 'bg-volt/15 text-volt' : 'text-subtle')}
          >
            <Scan className="size-3.5" /> Hitbox
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface p-1">
        {(['look', 'gear'] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx('h-10 rounded-lg text-sm font-semibold transition', tab === id ? 'bg-surface-3 text-fg' : 'text-subtle')}
          >
            {id === 'look' ? 'Aparência' : 'Equipamento'}
          </button>
        ))}
      </div>

      {tab === 'look' ? (
        <Card className="space-y-5 p-4">
          <Field label="Personagem">
            <Options
              options={GENDERS}
              value={look.gender ?? 0}
              onChange={(g) =>
                setLook({
                  ...look,
                  gender: g,
                  // feminina: sem barba e, se estiver careca/curto, começa com cabelo comprido
                  beard: g === 1 ? 0 : look.beard,
                  hair: g === 1 && [0, 1, 2, 5, 10].includes(look.hair) ? 3 : look.hair,
                })
              }
            />
          </Field>
          <Field label="Tom de pele">
            <Swatches colors={SKIN_TONES} value={look.skin} onChange={(c) => set('skin', c)} />
          </Field>
          <Field label="Cabelo">
            <Options options={HAIR_STYLES} value={look.hair} onChange={(i) => set('hair', i)} />
          </Field>
          <Field label="Cor do cabelo">
            <Swatches colors={HAIR_COLORS} value={look.hairColor} onChange={(c) => set('hairColor', c)} />
          </Field>
          {look.gender !== 1 && (
            <Field label="Barba">
              <Options options={BEARD_STYLES} value={look.beard} onChange={(i) => set('beard', i)} />
            </Field>
          )}
          <Field label="Cor dos olhos">
            <Swatches colors={EYE_COLORS} value={look.eyes} onChange={(c) => set('eyes', c)} />
          </Field>
          <Field label="Expressão">
            <Options options={FACE_STYLES} value={look.face} onChange={(i) => set('face', i)} />
          </Field>
          <Field label="Pintura / marcas">
            <Options options={MARKS} value={look.marks ?? 0} onChange={(i) => set('marks', i)} />
          </Field>
          <Field label="Acessório">
            <Options options={ACCESSORIES} value={look.accessory ?? 0} onChange={(i) => set('accessory', i)} />
          </Field>
          <Field label="Corpo">
            <Options options={BODY_TYPES} value={look.body} onChange={(i) => set('body', i)} />
          </Field>
          <Field label="Cor da regata">
            <Swatches colors={OUTFIT_COLORS} value={look.top} onChange={(c) => set('top', c)} />
          </Field>
          <Field label="Cor do short">
            <Swatches colors={OUTFIT_COLORS} value={look.shorts} onChange={(c) => set('shorts', c)} />
          </Field>
          <p className="text-[11px] text-subtle">A regata e o short aparecem quando você não está usando armadura nessas partes.</p>

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" disabled={!dirty} icon={<RotateCcw className="size-4" />} onClick={() => setLook(user.avatar)}>
              Desfazer
            </Button>
            <Button className="flex-1" disabled={!dirty} loading={saving} icon={<Save className="size-4" />} onClick={save}>
              Salvar
            </Button>
          </div>
        </Card>
      ) : (
        <GearTab />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted">{label}</p>
      {children}
    </div>
  );
}

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-label={c}
          aria-pressed={value === c}
          className={clsx('size-9 rounded-full ring-offset-2 ring-offset-surface transition', value === c ? 'ring-2 ring-volt' : 'ring-1 ring-line-strong')}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function Options({ options, value, onChange }: { options: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o, i) => (
        <button
          key={o}
          onClick={() => onChange(i)}
          className={clsx(
            'h-9 rounded-lg border px-3 text-xs font-semibold transition',
            value === i ? 'border-volt/50 bg-volt/10 text-volt' : 'border-line bg-surface-2 text-muted hover:text-fg',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const SLOT_LABEL: Record<EquipSlot, string> = { weapon: 'Arma', ...ARMOR_SLOT_LABEL };

function GearTab() {
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  const { data: owned } = useInventory();
  const [slot, setSlot] = useState<EquipSlot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const options = useMemo(() => {
    if (!slot || !owned) return [];
    return [...owned].filter((id) => (slot === 'weapon' ? !!WEAPONS_BY_ID[id] : parseArmorPieceId(id)?.slot === slot));
  }, [slot, owned]);
  if (!user) return null;

  async function equip(itemId: string | null) {
    if (!slot) return;
    setBusy(itemId ?? 'none');
    try {
      const r = await api.put<{ user: MeUser }>('/shop/equip', { slot, itemId });
      setUser(r.user);
      qc.invalidateQueries({ queryKey: ['profile'] });
      setSlot(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  const nameOf = (id: string | null) => {
    if (!id) return null;
    const w = WEAPONS_BY_ID[id];
    if (w) return w.name;
    const p = parseArmorPieceId(id);
    return p ? p.set.name : id;
  };

  return (
    <>
      <Card className="divide-y divide-line">
        {(['weapon', ...ARMOR_SLOTS] as EquipSlot[]).map((s) => {
          const id = user.equipment[s];
          const w = id ? WEAPONS_BY_ID[id] : undefined;
          return (
            <button key={s} onClick={() => setSlot(s)} className="flex w-full items-center gap-3 p-3.5 text-left transition hover:bg-surface-2">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2">
                {w ? <WeaponIcon weapon={w} size={44} /> : <span className="text-[10px] font-bold text-subtle uppercase">{SLOT_LABEL[s].slice(0, 4)}</span>}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted">{SLOT_LABEL[s]}</p>
                <p className={clsx('truncate text-sm font-semibold', !id && 'text-subtle')}>{nameOf(id) ?? 'Nada equipado'}</p>
              </div>
              <ChevronRight className="ml-auto size-4 text-subtle" />
            </button>
          );
        })}
      </Card>
      <Sheet open={!!slot} onClose={() => setSlot(null)} title={slot ? `Escolher ${SLOT_LABEL[slot].toLowerCase()}` : ''}>
        <div className="-mx-1 max-h-[60dvh] space-y-2 overflow-y-auto px-1">
          {slot && slot !== 'weapon' && (
            <button onClick={() => void equip(null)} className="flex h-12 w-full items-center rounded-xl bg-surface px-4 text-sm text-muted">
              Nenhum (tirar)
            </button>
          )}
          {options.map((id) => {
            const w = WEAPONS_BY_ID[id];
            const p = parseArmorPieceId(id);
            const active = slot && user.equipment[slot] === id;
            return (
              <button
                key={id}
                onClick={() => void equip(id)}
                disabled={!!busy}
                className={clsx('flex w-full items-center gap-3 rounded-xl border p-2.5 text-left', active ? 'border-volt/40 bg-volt/5' : 'border-transparent bg-surface')}
              >
                {w && <WeaponIcon weapon={w} size={40} />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{w?.name ?? p?.set.name}</p>
                  <RarityTag rarity={(w?.rarity ?? p?.set.rarity)!} />
                </div>
                {active && <span className="ml-auto text-xs font-semibold text-volt">Equipado</span>}
              </button>
            );
          })}
          {options.length === 0 && (
            <div className="py-6 text-center text-sm text-muted">
              Você ainda não tem itens para esse lugar.
              <Link to="/loja" className="mt-3 flex items-center justify-center gap-1 font-semibold text-volt">
                <Plus className="size-4" /> Ir para a loja
              </Link>
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}
