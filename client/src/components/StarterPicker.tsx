import { useState } from 'react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import { STARTER_WEAPONS, type MeUser } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { AvatarCanvas } from './AvatarCanvas';
import { AttackRow, Requirements } from './ItemBits';
import { Button, toast } from './ui';

const BLURB: Record<string, string> = {
  'espada-curta-recruta': 'Rápida e corpo a corpo. Evolua Destreza.',
  'cajado-aprendiz': 'Magia arcana à distância. Evolua Inteligência e Essência.',
  'selo-do-novico': 'Milagres de luz e cura. Evolua Fé e Essência.',
};

/** Tela obrigatória para quem ainda não escolheu a arma inicial gratuita. */
export function StarterPicker() {
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  const [choice, setChoice] = useState(STARTER_WEAPONS[0].id);
  const [busy, setBusy] = useState(false);
  if (!user || user.starterWeapon) return null;
  const w = STARTER_WEAPONS.find((x) => x.id === choice)!;

  async function confirm() {
    setBusy(true);
    try {
      const r = await api.post<{ user: MeUser }>('/shop/starter', { weaponId: choice });
      setUser(r.user);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast(`${w.name} é sua!`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="bg-glow fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Escolha sua arma inicial">
      <div className="safe-top safe-bottom mx-auto flex min-h-full max-w-md flex-col px-5 py-8">
        <p className="text-xs font-semibold tracking-widest text-volt uppercase">Bem-vindo, {user.username}</p>
        <h1 className="mt-2 font-display text-3xl leading-tight font-bold">Escolha sua arma inicial</h1>
        <p className="mt-2 text-sm text-muted">É grátis. Depois você compra outras na loja com o ouro dos seus treinos.</p>

        <div className="mt-6 grid grid-cols-3 gap-2">
          {STARTER_WEAPONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setChoice(s.id)}
              className={clsx(
                'flex flex-col items-center rounded-2xl border pt-1 pb-3 transition',
                choice === s.id ? 'border-volt/60 bg-volt/8' : 'border-line bg-surface',
              )}
            >
              <AvatarCanvas size={120} look={user.avatar} equipment={{ ...user.equipment, weapon: s.id }} animate={choice === s.id} ground={false} />
              <span className="px-1 text-center text-[11px] leading-tight font-semibold">{s.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm">{BLURB[w.id]}</p>
          <Requirements req={w.requirements} />
          <AttackRow slot={1} a={w.a1} />
          <AttackRow slot={2} a={w.a2} />
        </div>

        <Button size="lg" className="mt-auto w-full" style={{ marginTop: 24 }} loading={busy} onClick={confirm}>
          Pegar {w.name}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
