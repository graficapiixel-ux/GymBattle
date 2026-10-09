import { useState } from 'react';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { Check, AlertTriangle, Swords, Shirt, Sparkles, Lock, SlidersHorizontal, X } from 'lucide-react';
import {
  ARMOR_SETS, ARMOR_SLOTS, ARMOR_SLOT_LABEL, BALANCE, CATEGORY_LABEL, RARITY_COLOR, RARITY_LABEL, WEAPONS,
  armorPieceId, armorPiecePrice, armorSetPrice, missingRequirements, weaponPower, isWeaponRevealed, isArmorRevealed,
  type ArmorSetDef, type ArmorSlot, type MeUser, type Rarity, type WeaponCategory, type WeaponDef,
} from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useInventory } from '@/lib/inventory';
import { AvatarCanvas, WeaponIcon } from '@/components/AvatarCanvas';
import { AttackRow, ElementTag, Price, RarityTag, Requirements, Scaling } from '@/components/ItemBits';
import { Button, Sheet, toast } from '@/components/ui';

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export default function Shop() {
  const [tab, setTab] = useState<'weapons' | 'armor'>('weapons');
  const [cat, setCat] = useState<WeaponCategory | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [openWeapon, setOpenWeapon] = useState<WeaponDef | null>(null);
  const [openArmor, setOpenArmor] = useState<ArmorSetDef | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const { user } = useAuth();
  const { data: owned } = useInventory();

  const attrs = user?.attributes;
  const level = user?.level ?? 1;
  const seenWeapon = (w: WeaponDef) => !!attrs && (isWeaponRevealed(w, attrs) || !!owned?.has(w.id));
  const seenArmor = (a: ArmorSetDef) => isArmorRevealed(a, level) || ARMOR_SLOTS.some((s) => owned?.has(armorPieceId(a.id, s)));
  if (!user) return null;
  const hiddenWeapons = WEAPONS.filter((w) => !seenWeapon(w));
  const hiddenArmors = ARMOR_SETS.filter((a) => !seenArmor(a));
  const nextArmorLevel = Math.min(...hiddenArmors.map((a) => BALANCE.shop.armorRevealLevel[a.rarity]));
  // só dá para filtrar pelo que já apareceu na SUA loja (não entrega o que vem por aí)
  const seenWeapons = WEAPONS.filter(seenWeapon);
  const seenArmors = ARMOR_SETS.filter(seenArmor);
  const cats = (Object.keys(CATEGORY_LABEL) as WeaponCategory[]).filter((c) => seenWeapons.some((w) => w.category === c));
  const rarities = RARITIES.filter((r) => (tab === 'weapons' ? seenWeapons : seenArmors).some((x) => x.rarity === r));
  const activeCat = tab === 'weapons' && cat !== 'all' && cats.includes(cat) ? cat : 'all';
  const activeRarity = rarity !== 'all' && rarities.includes(rarity) ? rarity : 'all';
  const activeCount = (activeCat !== 'all' ? 1 : 0) + (activeRarity !== 'all' ? 1 : 0);
  const weapons = seenWeapons.filter((w) => (activeCat === 'all' || w.category === activeCat) && (activeRarity === 'all' || w.rarity === activeRarity));
  const armors = seenArmors.filter((a) => activeRarity === 'all' || a.rarity === activeRarity);
  // mais de N armas (arredondado para baixo, de 10 em 10)
  const totalWeaponsText = Math.floor((WEAPONS.length - 1) / 10) * 10;

  return (
    <div className="animate-fade-up space-y-4">
      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface p-1">
        {(
          [
            ['weapons', 'Armas', Swords, seenWeapons.length],
            ['armor', 'Armaduras', Shirt, seenArmors.length],
          ] as const
        ).map(([id, label, Icon, n]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition',
              tab === id ? 'bg-surface-3 text-fg' : 'text-subtle',
            )}
          >
            <Icon className="size-4" /> {label} <span className="text-xs font-normal text-subtle">{n}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilterOpen(true)}
          className={clsx(
            'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition',
            activeCount ? 'border-volt/50 bg-volt/10 text-volt' : 'border-line bg-surface text-fg hover:bg-surface-2',
          )}
        >
          <SlidersHorizontal className="size-4" /> Filtro
          {activeCount > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-volt text-[11px] font-bold text-black">{activeCount}</span>
          )}
        </button>
        {activeCat !== 'all' && <FilterPill label={CATEGORY_LABEL[activeCat]} onClear={() => setCat('all')} />}
        {activeRarity !== 'all' && (
          <FilterPill label={RARITY_LABEL[activeRarity]} color={RARITY_COLOR[activeRarity]} onClear={() => setRarity('all')} />
        )}
      </div>

      {tab === 'weapons' && hiddenWeapons.length > 0 && (
        <HiddenCard
          title={`Mais de ${totalWeaponsText} armas para descobrir`}
          hint="Elas vão sendo desbloqueadas aqui na loja conforme você evolui seus atributos."
        />
      )}
      {tab === 'armor' && hiddenArmors.length > 0 && (
        <HiddenCard
          title="Mais armaduras para descobrir"
          hint={<>Novas armaduras aparecem conforme você sobe de nível. Próximas no nível <b className="text-fg">{nextArmorLevel}</b>.</>}
        />
      )}

      {tab === 'weapons' ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {weapons.map((w) => {
            const has = owned?.has(w.id);
            const unmet = missingRequirements(w, user.attributes).length > 0;
            return (
              <button
                key={w.id}
                onClick={() => setOpenWeapon(w)}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left transition hover:border-line-strong active:scale-[0.98]"
              >
                <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: RARITY_COLOR[w.rarity] }} />
                <div
                  className="grid h-28 place-items-center"
                  style={{ background: `radial-gradient(circle at 50% 60%, ${RARITY_COLOR[w.rarity]}22, transparent 70%)` }}
                >
                  <WeaponIcon weapon={w} size={88} />
                </div>
                <div className="flex flex-1 flex-col p-3 pt-1">
                  <RarityTag rarity={w.rarity} className="self-start" />
                  <p className="mt-1.5 line-clamp-2 text-sm leading-tight font-semibold">{w.name}</p>
                  <p className="mt-0.5 text-[11px] text-subtle">{CATEGORY_LABEL[w.category]}</p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    {has ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-volt">
                        <Check className="size-3.5" /> Seu
                      </span>
                    ) : (
                      <Price value={w.price} muted={user.gold < w.price} className="text-sm" />
                    )}
                    {unmet && <AlertTriangle className="size-3.5 text-danger" aria-label="Requisitos não atendidos" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {armors.map((a) => {
            const ownedSlots = ARMOR_SLOTS.filter((s) => owned?.has(armorPieceId(a.id, s)));
            return (
              <button
                key={a.id}
                onClick={() => setOpenArmor(a)}
                className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left transition hover:border-line-strong active:scale-[0.98]"
              >
                <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: RARITY_COLOR[a.rarity] }} />
                <div
                  className="flex h-36 justify-center"
                  style={{ background: `radial-gradient(circle at 50% 70%, ${RARITY_COLOR[a.rarity]}22, transparent 70%)` }}
                >
                  <AvatarCanvas size={144} animate={a.rarity === 'legendary'} look={user.avatar} equipment={fullSet(a.id, user.equipment.weapon)} />
                </div>
                <div className="flex flex-1 flex-col p-3 pt-1">
                  <RarityTag rarity={a.rarity} className="self-start" />
                  <p className="mt-1.5 line-clamp-2 text-sm leading-tight font-semibold">{a.name}</p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    {ownedSlots.length === 4 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-volt">
                        <Check className="size-3.5" /> Completo
                      </span>
                    ) : (
                      <Price value={armorSetPrice(a, ownedSlots)} muted={user.gold < armorSetPrice(a, ownedSlots)} className="text-sm" />
                    )}
                    {ownedSlots.length > 0 && ownedSlots.length < 4 && <span className="text-[11px] text-subtle">{ownedSlots.length}/4</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        tab={tab}
        cats={cats}
        rarities={rarities}
        cat={activeCat}
        rarity={activeRarity}
        onCat={setCat}
        onRarity={setRarity}
      />
      <WeaponSheet weapon={openWeapon} onClose={() => setOpenWeapon(null)} owned={!!openWeapon && !!owned?.has(openWeapon.id)} />
      <ArmorSheet set={openArmor} onClose={() => setOpenArmor(null)} owned={owned} />
    </div>
  );
}

const fullSet = (setId: string, weapon: string | null) => ({
  weapon,
  helm: armorPieceId(setId, 'helm'),
  chest: armorPieceId(setId, 'chest'),
  gloves: armorPieceId(setId, 'gloves'),
  legs: armorPieceId(setId, 'legs'),
});

function FilterSheet({
  open, onClose, tab, cats, rarities, cat, rarity, onCat, onRarity,
}: {
  open: boolean;
  onClose: () => void;
  tab: 'weapons' | 'armor';
  cats: WeaponCategory[];
  rarities: Rarity[];
  cat: WeaponCategory | 'all';
  rarity: Rarity | 'all';
  onCat: (c: WeaponCategory | 'all') => void;
  onRarity: (r: Rarity | 'all') => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Filtro">
      <div className="space-y-5">
        {tab === 'weapons' && (
          <section>
            <p className="mb-2 text-xs font-semibold text-muted">Tipo de arma</p>
            <div className="flex flex-wrap gap-2">
              <Option active={cat === 'all'} onClick={() => onCat('all')}>
                Todos
              </Option>
              {cats.map((c) => (
                <Option key={c} active={cat === c} onClick={() => onCat(c)}>
                  {CATEGORY_LABEL[c]}
                </Option>
              ))}
            </div>
          </section>
        )}
        <section>
          <p className="mb-2 text-xs font-semibold text-muted">Raridade</p>
          <div className="flex flex-wrap gap-2">
            <Option active={rarity === 'all'} onClick={() => onRarity('all')}>
              Todas
            </Option>
            {rarities.map((r) => (
              <Option key={r} active={rarity === r} color={RARITY_COLOR[r]} onClick={() => onRarity(r)}>
                {RARITY_LABEL[r]}
              </Option>
            ))}
          </div>
        </section>
        <p className="text-xs text-subtle">Só aparecem os tipos e raridades que você já desbloqueou.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              onCat('all');
              onRarity('all');
            }}
          >
            Limpar
          </Button>
          <Button onClick={onClose}>Ver itens</Button>
        </div>
      </div>
    </Sheet>
  );
}

function Option({ active, color, onClick, children }: { active: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'h-9 rounded-full border px-3.5 text-sm font-semibold transition',
        active ? 'border-transparent bg-fg text-bg' : 'border-line bg-surface text-muted hover:text-fg',
      )}
      style={active && color ? { background: color, color: '#0b0b0f' } : !active && color ? { color } : undefined}
    >
      {children}
    </button>
  );
}

function FilterPill({ label, color, onClear }: { label: string; color?: string; onClear: () => void }) {
  return (
    <span
      className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface pr-1.5 pl-3 text-sm font-semibold"
      style={color ? { color } : undefined}
    >
      {label}
      <button onClick={onClear} aria-label={`Remover filtro ${label}`} className="grid size-6 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-fg">
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function useBuy() {
  const { setUser } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<{ user: MeUser; spent?: number }>, msg: string) {
    setBusy(key);
    try {
      const r = await fn();
      setUser(r.user);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast(msg);
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { busy, run };
}

function WeaponSheet({ weapon: w, onClose, owned }: { weapon: WeaponDef | null; onClose: () => void; owned: boolean }) {
  const { user } = useAuth();
  const { busy, run } = useBuy();
  if (!w || !user) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const power = weaponPower(w, user.attributes);
  const missing = missingRequirements(w, user.attributes);
  const equipped = user.equipment.weapon === w.id;

  return (
    <Sheet open={!!w} onClose={onClose} title={w.name}>
      <div className="-mx-1 max-h-[72dvh] space-y-4 overflow-y-auto px-1 pb-1">
        <div className="flex items-center gap-4">
          <div
            className="grid size-24 shrink-0 place-items-center rounded-2xl"
            style={{ background: `radial-gradient(circle, ${RARITY_COLOR[w.rarity]}33, transparent 70%)` }}
          >
            <WeaponIcon weapon={w} size={92} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <RarityTag rarity={w.rarity} />
              <span className="text-xs text-subtle">{CATEGORY_LABEL[w.category]}</span>
            </div>
            <ElementTag el={w.element} />
            <p className="text-sm text-muted italic">“{w.lore}”</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Dano (você)" value={power.damage} danger={power.unmet} />
          <Stat label="Dano base" value={w.baseDamage} />
          <Stat label="Velocidade" value={`${power.speed}×`} danger={power.unmet} />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">Requisitos</p>
          <Requirements req={w.requirements} attrs={user.attributes} />
          {missing.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              Sem os requisitos você pode usar, mas com dano muito reduzido ({Math.round(BALANCE.attributes.unmetRequirementDamageMult * 100)}%) e ataques mais
              lentos.
            </p>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">Escalonamento</p>
          <Scaling scaling={w.scaling} />
        </div>
        <div className="space-y-2">
          <AttackRow slot={1} a={w.a1} />
          <AttackRow slot={2} a={w.a2} />
        </div>
      </div>

      <div className="mt-4">
        {owned ? (
          <Button
            className="w-full"
            size="lg"
            variant={equipped ? 'secondary' : 'primary'}
            disabled={equipped}
            loading={busy === 'equip'}
            icon={<Check className="size-4" />}
            onClick={() =>
              void run('equip', () => api.put('/shop/equip', { slot: 'weapon', itemId: w.id }), `${w.name} equipada!`)
            }
          >
            {equipped ? 'Equipada' : 'Equipar'}
          </Button>
        ) : (
          <Button
            className="w-full"
            size="lg"
            disabled={user.gold < w.price}
            loading={busy === 'buy'}
            onClick={() => void run('buy', () => api.post('/shop/buy', { itemId: w.id }), 'Compra feita! Equipe no Avatar.')}
          >
            {user.gold < w.price ? `Faltam ${w.price - user.gold} de ouro` : <>Comprar por <Price value={w.price} inherit /></>}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function ArmorSheet({ set: a, onClose, owned }: { set: ArmorSetDef | null; onClose: () => void; owned?: Set<string> }) {
  const { user } = useAuth();
  const { busy, run } = useBuy();
  if (!a || !user) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const ownedSlots = ARMOR_SLOTS.filter((s) => owned?.has(armorPieceId(a.id, s)));
  const setPrice = armorSetPrice(a, ownedSlots);
  const complete = ownedSlots.length === 4;

  async function equipAll() {
    for (const s of ownedSlots) await api.put('/shop/equip', { slot: s, itemId: armorPieceId(a!.id, s) });
    const me = await api.get<{ user: MeUser }>('/auth/me');
    return { user: me.user! };
  }

  return (
    <Sheet open={!!a} onClose={onClose} title={a.name}>
      <div className="-mx-1 max-h-[72dvh] space-y-4 overflow-y-auto px-1 pb-1">
        <div className="flex items-center gap-3">
          <div
            className="flex h-48 w-40 shrink-0 justify-center rounded-2xl"
            style={{ background: `radial-gradient(circle at 50% 70%, ${RARITY_COLOR[a.rarity]}33, transparent 70%)` }}
          >
            <AvatarCanvas size={190} look={user.avatar} equipment={fullSet(a.id, user.equipment.weapon)} />
          </div>
          <div className="space-y-2">
            <RarityTag rarity={a.rarity} />
            <p className="text-sm text-muted italic">“{a.lore}”</p>
            <p className="inline-flex items-center gap-1 text-xs text-subtle">
              <Sparkles className="size-3.5" /> Apenas visual, sem atributos
            </p>
          </div>
        </div>

        <div className="divide-y divide-line rounded-xl bg-surface">
          {ARMOR_SLOTS.map((s: ArmorSlot) => {
            const id = armorPieceId(a.id, s);
            const has = owned?.has(id);
            const price = armorPiecePrice(a, s);
            const equipped = user.equipment[s] === id;
            return (
              <div key={s} className="flex items-center gap-3 p-3">
                <span className="text-sm font-medium">{ARMOR_SLOT_LABEL[s]}</span>
                <div className="ml-auto flex items-center gap-2">
                  {has ? (
                    <Button
                      size="sm"
                      variant={equipped ? 'secondary' : 'ghost'}
                      disabled={equipped}
                      loading={busy === `eq-${s}`}
                      onClick={() => void run(`eq-${s}`, () => api.put('/shop/equip', { slot: s, itemId: id }), 'Equipado!')}
                    >
                      {equipped ? 'Equipado' : 'Equipar'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={user.gold < price}
                      loading={busy === `buy-${s}`}
                      onClick={() => void run(`buy-${s}`, () => api.post('/shop/buy', { itemId: id }), `${ARMOR_SLOT_LABEL[s]} comprado!`)}
                    >
                      <Price value={price} className="text-xs" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4">
        {complete ? (
          <Button className="w-full" size="lg" loading={busy === 'eqall'} onClick={() => void run('eqall', equipAll, 'Conjunto equipado!')}>
            Equipar conjunto completo
          </Button>
        ) : (
          <Button
            className="w-full"
            size="lg"
            disabled={user.gold < setPrice}
            loading={busy === 'set'}
            onClick={() => void run('set', () => api.post('/shop/buy-set', { setId: a.id }), 'Conjunto comprado!')}
          >
            {user.gold < setPrice ? (
              `Faltam ${setPrice - user.gold} de ouro`
            ) : (
              <>
                {ownedSlots.length ? 'Completar conjunto' : `Conjunto (−${Math.round(BALANCE.shop.armorSetDiscount * 100)}%)`} ·{' '}
                <Price value={setPrice} inherit />
              </>
            )}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function HiddenCard({ title, hint }: { title: string; hint: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/60 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-3">
        <Lock className="size-4 text-muted" />
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-surface px-2 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={clsx('font-display text-lg font-semibold tabular-nums', danger && 'text-danger')}>{value}</p>
    </div>
  );
}
