/** Foto de perfil (pode ser da galeria) e confirmação do CPF de quem já tinha conta. */
import { useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, ShieldCheck, IdCard, Lock } from 'lucide-react';
import { formatCpf, isValidCpf, type MeUser } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Avatar } from './UserChip';
import { Alert, Button, Card, Input, Sheet, toast } from './ui';

export function PhotoCard({ user }: { user: MeUser }) {
  const { setUser } = useAuth();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'up' | 'del' | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy('up');
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const r = await api.post<{ user: MeUser }>('/me/photo', fd);
      setUser(r.user);
      toast('Foto de perfil atualizada!');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <Camera className="size-4 text-volt" /> Foto de perfil
      </h3>
      <div className="mt-3 flex items-center gap-4">
        <Avatar user={user} size={72} />
        <div className="flex flex-1 flex-col gap-2">
          {/* sem "capture": pode escolher da galeria */}
          <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          <Button icon={<ImagePlus className="size-4" />} loading={busy === 'up'} onClick={() => ref.current?.click()}>
            {user.photoUrl ? 'Trocar foto' : 'Escolher foto'}
          </Button>
          {user.photoUrl && (
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              loading={busy === 'del'}
              onClick={async () => {
                setBusy('del');
                try {
                  setUser((await api.del<{ user: MeUser }>('/me/photo')).user);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Usar o guerreiro de novo
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-subtle">Aparece no feed, no ranking e no seu perfil. Fotos impróprias são removidas.</p>
    </Card>
  );
}

export function CpfCard({ user }: { user: MeUser }) {
  const { setUser } = useAuth();
  const [cpf, setCpf] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user.hasCpf) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <span className="grid size-10 place-items-center rounded-xl bg-volt/10">
          <ShieldCheck className="size-5 text-volt" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">CPF confirmado</p>
          <p className="text-xs text-muted">•••.•••.•••-{user.cpfLast2 ?? '••'} · não pode ser trocado</p>
        </div>
        <Lock className="size-4 text-subtle" />
      </Card>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ user: MeUser }>('/me/cpf', { cpf });
      setUser(r.user);
      setConfirm(false);
      toast('CPF confirmado! Obrigado.');
    } catch (e) {
      setConfirm(false);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="cpf" className="scroll-mt-20">
    <Card className="border-gold/40 p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <IdCard className="size-4 text-gold" /> Confirme seu CPF
      </h3>
      <p className="mt-1 text-sm text-muted">
        Agora cada pessoa só pode ter uma conta. Informe seu CPF para manter a sua. Ele não aparece para ninguém.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <Input
          label="CPF"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          value={cpf}
          onChange={(e) => setCpf(formatCpf(e.target.value))}
        />
        {cpf.replace(/\D/g, '').length === 11 && !isValidCpf(cpf) && <p className="text-xs text-danger">CPF inválido. Confira os números.</p>}
        {error && <Alert>{error}</Alert>}
        <Button disabled={!isValidCpf(cpf)} onClick={() => setConfirm(true)}>
          Confirmar CPF
        </Button>
      </div>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Confirmar CPF?">
        <p className="text-sm text-muted">
          Confira com atenção: <b className="font-display text-lg text-fg">{cpf}</b>
        </p>
        <p className="mt-2 text-sm text-muted">
          Depois de confirmar, <b className="text-fg">não dá para trocar</b>.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Corrigir
          </Button>
          <Button loading={busy} onClick={send}>
            Está certo
          </Button>
        </div>
      </Sheet>
    </Card>
    </div>
  );
}
