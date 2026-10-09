import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Download, Share, SquarePlus, Check, Copy, EllipsisVertical, Ellipsis, Menu, Globe, Compass } from 'lucide-react';
import { androidBrowser, iosBrowser, isAndroid, isInAppBrowser, isIOS, openInChrome, useInstall } from '@/lib/pwa';
import { Button, Sheet, toast } from './ui';

/**
 * Botão "Baixar app".
 *  - Android/PC com convite do navegador: instala direto.
 *  - Senão, abre um passo a passo feito para o aparelho E o navegador da pessoa
 *    (iPhone Safari/Chrome, Android Chrome/Samsung/Firefox, e aviso quando o link
 *    foi aberto dentro do Instagram/WhatsApp/TikTok, onde não dá para instalar).
 */
export function InstallButton({ className, variant = 'secondary', compact }: { className?: string; variant?: 'primary' | 'secondary'; compact?: boolean }) {
  const install = useInstall();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (install.installed) return null;

  const onClick = async () => {
    if (busy) return;
    // dentro do Instagram/WhatsApp etc. não adianta esperar convite
    if (!isInAppBrowser() && !isIOS()) {
      setBusy(true);
      try {
        const r = await install.prompt();
        if (r === true) return void toast('Pronto! O GymBattle foi instalado na sua tela inicial.');
        if (r === false) return; // a pessoa cancelou
      } finally {
        setBusy(false);
      }
    }
    setOpen(true);
  };

  return (
    <>
      {compact ? (
        <button
          onClick={onClick}
          aria-label="Baixar app"
          title="Baixar app"
          className={clsx(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-volt px-2.5 text-xs font-bold text-black transition active:scale-95',
            className,
          )}
        >
          <Download className="size-3.5" strokeWidth={2.6} />
          <span className="hidden min-[385px]:inline min-[420px]:hidden">App</span>
          <span className="hidden min-[420px]:inline">Baixar app</span>
        </button>
      ) : (
        <Button variant={variant} className={className} loading={busy} icon={<Download className="size-4" />} onClick={onClick}>
          Baixar app
        </Button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Instalar o GymBattle">
        <InstallSteps alreadyInstalled={install.alreadyInstalled} />
        <Button className="mt-5 w-full" onClick={() => setOpen(false)} icon={<Check className="size-4" />}>
          Entendi
        </Button>
      </Sheet>
    </>
  );
}

function copyLink() {
  const url = location.origin;
  const ok = () => toast('Link copiado! Cole no navegador.');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(ok, () => fallbackCopy(url, ok));
  else fallbackCopy(url, ok);
}
function fallbackCopy(text: string, ok: () => void) {
  const t = document.createElement('textarea');
  t.value = text;
  t.style.position = 'fixed';
  t.style.opacity = '0';
  document.body.appendChild(t);
  t.select();
  try {
    document.execCommand('copy');
    ok();
  } catch {
    toast(`Copie este link: ${text}`, 'error');
  }
  t.remove();
}

function InstallSteps({ alreadyInstalled }: { alreadyInstalled: boolean }) {
  const ios = isIOS();
  const android = isAndroid();
  const site = location.host;

  if (alreadyInstalled) {
    return (
      <p className="text-sm text-muted">
        O GymBattle <b className="text-fg">já está instalado</b> neste celular. Procure o ícone <b className="text-fg">GymBattle</b> na tela
        inicial ou na lista de apps e abra por ele.
      </p>
    );
  }

  // Link aberto dentro do Instagram / WhatsApp / TikTok / Facebook…
  if (isInAppBrowser()) {
    return (
      <div className="space-y-4 text-sm">
        <p className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5 text-fg">
          Você abriu o link <b>dentro de outro app</b> (Instagram, WhatsApp, TikTok…). Daqui não dá para instalar: abra no{' '}
          <b>{ios ? 'Safari' : 'Chrome'}</b> primeiro.
        </p>
        {android ? (
          <>
            <Button className="w-full" icon={<Globe className="size-4" />} onClick={openInChrome}>
              Abrir no Chrome
            </Button>
            <p className="text-muted">
              Se não abrir: toque em <EllipsisVertical className="mx-0.5 inline size-4 text-volt" /> no canto de cima e escolha{' '}
              <b className="text-fg">Abrir no Chrome</b> (ou “Abrir no navegador”).
            </p>
          </>
        ) : (
          <ol className="space-y-3">
            <Step n={1}>
              Toque em <Ellipsis className="mx-0.5 inline size-4 text-volt" /> ou <Compass className="mx-0.5 inline size-4 text-volt" /> (no canto
              da tela) e escolha <b>Abrir no Safari</b> / “Abrir no navegador”.
            </Step>
            <Step n={2}>
              Se não tiver essa opção: copie o link abaixo, abra o <b>Safari</b> e cole na barra de endereço.
            </Step>
          </ol>
        )}
        <Button variant="secondary" className="w-full" icon={<Copy className="size-4" />} onClick={copyLink}>
          Copiar link ({site})
        </Button>
      </div>
    );
  }

  if (ios) {
    const br = iosBrowser();
    if (br === 'safari') {
      return (
        <ol className="space-y-3 text-sm">
          <Step n={1}>
            Toque em <Share className="mx-0.5 inline size-4 text-volt" /> <b>Compartilhar</b>. <br />
            <span className="text-subtle">
              No iOS mais novo ele fica escondido: toque em <Ellipsis className="mx-0.5 inline size-4 text-volt" /> (na barra de baixo) e depois
              em <b>Compartilhar</b>.
            </span>
          </Step>
          <Step n={2}>
            Role a lista e toque em <SquarePlus className="mx-0.5 inline size-4 text-volt" /> <b>Adicionar à Tela de Início</b>{' '}
            <span className="text-subtle">(se não aparecer, toque em “Ver mais” / “Editar ações”)</span>.
          </Step>
          <Step n={3}>
            Deixe <b>Abrir como App Web</b> ligado (se aparecer) e toque em <b>Adicionar</b>. Pronto!
          </Step>
        </ol>
      );
    }
    if (br === 'chrome' || br === 'edge' || br === 'firefox') {
      return (
        <ol className="space-y-3 text-sm">
          <Step n={1}>
            Toque em <Share className="mx-0.5 inline size-4 text-volt" /> <b>Compartilhar</b> — no {br === 'chrome' ? 'Chrome' : br === 'edge' ? 'Edge' : 'Firefox'} fica na
            barra de endereço, lá em cima (ou no menu <Ellipsis className="mx-0.5 inline size-4 text-volt" />).
          </Step>
          <Step n={2}>
            Toque em <SquarePlus className="mx-0.5 inline size-4 text-volt" /> <b>Adicionar à Tela de Início</b> e depois em <b>Adicionar</b>.
          </Step>
          <Step n={3}>
            <span className="text-subtle">
              Não achou? Abra <b>{site}</b> no <b>Safari</b> e siga os passos por lá.
            </span>
          </Step>
        </ol>
      );
    }
    return (
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Neste navegador não dá para instalar. Abra <b className="text-fg">{site}</b> no <b className="text-fg">Safari</b> e toque em Baixar app de
          novo.
        </p>
        <Button variant="secondary" className="w-full" icon={<Copy className="size-4" />} onClick={copyLink}>
          Copiar link
        </Button>
      </div>
    );
  }

  if (android) {
    const br = androidBrowser();
    if (br === 'samsung') {
      return (
        <ol className="space-y-3 text-sm">
          <Step n={1}>
            Toque em <Menu className="mx-0.5 inline size-4 text-volt" /> (menu, embaixo à direita).
          </Step>
          <Step n={2}>
            Toque em <b>Adicionar página a</b> → <b>Tela inicial</b> (ou “Instalar”).
          </Step>
          <Step n={3}>
            Confirme em <b>Adicionar</b>. Pronto!
          </Step>
        </ol>
      );
    }
    if (br === 'firefox') {
      return (
        <ol className="space-y-3 text-sm">
          <Step n={1}>
            Toque em <EllipsisVertical className="mx-0.5 inline size-4 text-volt" /> (menu).
          </Step>
          <Step n={2}>
            Toque em <b>Instalar</b> (ou “Adicionar à tela inicial”) e confirme.
          </Step>
        </ol>
      );
    }
    return (
      <div className="space-y-4 text-sm">
        <ol className="space-y-3">
          <Step n={1}>
            Toque em <EllipsisVertical className="mx-0.5 inline size-4 text-volt" /> no canto de cima {br === 'chrome' ? 'do Chrome' : 'do navegador'}.
          </Step>
          <Step n={2}>
            Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.
          </Step>
          <Step n={3}>
            Confirme em <b>Instalar</b>. O ícone do GymBattle aparece na tela inicial.
          </Step>
        </ol>
        {br !== 'chrome' && (
          <Button variant="secondary" className="w-full" icon={<Globe className="size-4" />} onClick={openInChrome}>
            Não achou? Abrir no Chrome
          </Button>
        )}
      </div>
    );
  }

  // computador
  return (
    <ol className="space-y-3 text-sm">
      <Step n={1}>
        No <b>Chrome</b> ou <b>Edge</b>: clique no ícone <Download className="mx-0.5 inline size-4 text-volt" /> na barra de endereço, ou no menu{' '}
        <EllipsisVertical className="mx-0.5 inline size-4 text-volt" /> → <b>Instalar GymBattle</b>.
      </Step>
      <Step n={2}>
        No <b>Safari</b> do Mac: menu <b>Arquivo</b> → <b>Adicionar ao Dock</b>.
      </Step>
    </ol>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-volt text-xs font-bold text-black">{n}</span>
      <span className="pt-0.5 text-muted [&_b]:text-fg">{children}</span>
    </li>
  );
}
