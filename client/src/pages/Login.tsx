import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Eye, EyeOff, Dumbbell, Camera, Sparkles, Swords, ArrowRight, Users } from 'lucide-react';
import { formatCpf, isValidCpf, type GroupDTO, type MeUser } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth, useConfig } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import { InstallButton } from '@/components/InstallButton';
import { Alert, Button, Input } from '@/components/ui';

const LOOP = [
  { icon: Dumbbell, label: 'Treine' },
  { icon: Camera, label: 'Poste' },
  { icon: Sparkles, label: 'Evolua' },
  { icon: Swords, label: 'Lute' },
];

export default function Login() {
  const { setUser } = useAuth();
  const { data: config } = useConfig();
  const signupEnabled = config?.signupEnabled ?? false;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [cpf, setCpf] = useState('');
  // aberto por um link de convite (/convite/<código>): mostra de qual grupo é
  const invite = useLocation().pathname.match(/^\/convite\/([a-z0-9]{4,16})/i)?.[1];
  const { data: inviteData } = useQuery({
    queryKey: ['invite-preview', invite],
    queryFn: () => api.get<{ group: GroupDTO }>(`/groups/invite/${invite}`),
    enabled: !!invite,
    retry: false,
  });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isRegister = mode === 'register' && signupEnabled;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isRegister && !isValidCpf(cpf)) {
      setError('CPF inválido. Confira os números.');
      return;
    }
    setLoading(true);
    try {
      const { user } = isRegister
        ? await api.post<{ user: MeUser }>('/auth/register', { email, username, password, cpf })
        : await api.post<{ user: MeUser }>('/auth/login', { email, password });
      setUser(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-glow min-h-dvh lg:grid lg:grid-cols-2">
      {/* Apresentação */}
      <section className="relative hidden overflow-hidden border-r border-line lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Logo />
        <div>
          <h1 className="font-display text-6xl font-bold leading-[1.02] tracking-tight">
            Seu treino
            <br />
            vira <span className="text-volt">poder.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted">
            Poste a foto do treino, ganhe XP e ouro, evolua seu guerreiro e desafie a galera da academia na arena.
          </p>
          <LoopRow className="mt-10" />
        </div>
        <p className="text-sm text-subtle">Constância vence. Um treino por dia, todo dia.</p>
        <div className="pointer-events-none absolute -right-40 -bottom-40 size-[36rem] rounded-full bg-volt/5 blur-3xl" />
      </section>

      {/* Formulário */}
      <section className="safe-top flex min-h-dvh flex-col px-5 py-8 sm:px-8 lg:min-h-0 lg:justify-center">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col lg:flex-none">
          <div className="lg:hidden">
            <Logo />
            <h1 className="mt-10 font-display text-4xl font-bold leading-tight tracking-tight">
              Seu treino vira <span className="text-volt">poder.</span>
            </h1>
            <LoopRow className="mt-6" />
          </div>

          <div className="mt-10 lg:mt-0">
            {inviteData && (
              <div className="mb-5 flex items-center gap-3 rounded-2xl border border-volt/40 bg-volt/10 px-4 py-3 text-sm">
                <Users className="size-5 shrink-0 text-volt" />
                <p>
                  Você foi convidado para o grupo <b>{inviteData.group.name}</b>. Entre ou crie sua conta para participar.
                </p>
              </div>
            )}
            <h2 className="text-2xl font-semibold">{isRegister ? 'Criar conta' : 'Entrar'}</h2>
            <p className="mt-1 text-sm text-muted">
              {isRegister ? 'Comece sua jornada em menos de um minuto.' : 'Bem-vindo de volta, guerreiro.'}
            </p>

            {signupEnabled && (
              <div className="mt-6 grid grid-cols-2 rounded-xl border border-line bg-surface p-1" role="tablist">
                {(['login', 'register'] as const).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => {
                      setMode(m);
                      setError(null);
                    }}
                    className={clsx(
                      'h-10 rounded-lg text-sm font-semibold transition',
                      mode === m ? 'bg-surface-3 text-fg' : 'text-subtle hover:text-fg',
                    )}
                  >
                    {m === 'login' ? 'Entrar' : 'Criar conta'}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
              <Input
                label="E-mail"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="voce@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {isRegister && (
                <Input
                  label="Nome de usuário"
                  autoComplete="username"
                  placeholder="ex.: marombeiro_99"
                  hint="3 a 20 caracteres: letras, números, _ e ."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              )}
              {isRegister && (
                <Input
                  label="CPF"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="000.000.000-00"
                  hint="Só para garantir uma conta por pessoa. Não aparece para ninguém."
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  required
                />
              )}
              <Input
                label="Senha"
                type={showPw ? 'text' : 'password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                placeholder={isRegister ? 'Mínimo 8 caracteres' : '••••••••'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="grid size-9 place-items-center rounded-lg text-subtle hover:text-fg"
                    aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                }
              />
              {error && <Alert>{error}</Alert>}
              <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
                {isRegister ? 'Criar conta' : 'Entrar'}
                {!loading && <ArrowRight className="size-4" />}
              </Button>
            </form>

            {!signupEnabled && config && (
              <p className="mt-5 text-center text-xs text-subtle">
                Novas contas estão fechadas no momento. Peça um convite ao administrador.
              </p>
            )}
          </div>

          <div className="mt-auto flex justify-center pt-10 lg:mt-8">
            <InstallButton />
          </div>
        </div>
      </section>
    </div>
  );
}

function LoopRow({ className }: { className?: string }) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-1.5 sm:gap-2', className)}>
      {LOOP.map(({ icon: Icon, label }, i) => (
        <div key={label} className="flex items-center gap-1.5 sm:gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-xs font-medium sm:h-9 sm:gap-2 sm:px-3.5 sm:text-sm">
            <Icon className="size-3.5 text-volt sm:size-4" />
            {label}
          </span>
          {i < LOOP.length - 1 && <span className="hidden h-px w-3 bg-line-strong min-[400px]:block" />}
        </div>
      ))}
    </div>
  );
}
