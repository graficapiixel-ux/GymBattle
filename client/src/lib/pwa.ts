import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let relatedInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    notify();
  });
  // Android/Chrome: descobre se o app JÁ está instalado neste celular
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
  nav
    .getInstalledRelatedApps?.()
    .then((apps) => {
      if (apps.length) {
        relatedInstalled = true;
        notify();
      }
    })
    .catch(() => {});
}

const ua = () => navigator.userAgent;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /android/i.test(ua());

/**
 * Navegador de dentro de outro app (Instagram, Facebook, TikTok, WhatsApp no
 * Android…). Nesses NÃO dá para instalar: precisa abrir no Chrome/Safari.
 */
export const isInAppBrowser = () =>
  /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|TikTok|musical_ly|Bytedance|BytedanceWebview|Snapchat|Twitter|LinkedInApp|Pinterest|GSA\/|KAKAOTALK|WhatsApp|; wv\)/i.test(ua());

/** No iPhone: qual navegador (Safari, Chrome, Firefox, Edge…). */
export const iosBrowser = (): 'safari' | 'chrome' | 'firefox' | 'edge' | 'other' => {
  const u = ua();
  if (/CriOS/i.test(u)) return 'chrome';
  if (/FxiOS/i.test(u)) return 'firefox';
  if (/EdgiOS/i.test(u)) return 'edge';
  if (/Safari/i.test(u) && !/OPiOS|YaBrowser|DuckDuckGo/i.test(u)) return 'safari';
  return 'other';
};

/** No Android: qual navegador. */
export const androidBrowser = (): 'chrome' | 'samsung' | 'firefox' | 'edge' | 'opera' | 'other' => {
  const u = ua();
  if (/SamsungBrowser/i.test(u)) return 'samsung';
  if (/Firefox/i.test(u)) return 'firefox';
  if (/EdgA/i.test(u)) return 'edge';
  if (/OPR|Opera/i.test(u)) return 'opera';
  if (/Chrome/i.test(u)) return 'chrome';
  return 'other';
};

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Abre este site no Chrome (Android), saindo do navegador do Instagram/WhatsApp. */
export function openInChrome() {
  const { host, pathname, search } = location;
  location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href)};end`;
}

/** Espera um pouco pelo convite de instalação do Chrome (ele pode chegar alguns segundos depois de abrir). */
function waitForPrompt(ms: number) {
  if (deferred) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const done = () => {
      clearTimeout(t);
      listeners.delete(done);
      resolve(!!deferred);
    };
    const t = setTimeout(done, ms);
    listeners.add(done);
  });
}

/** Estado do botão "Baixar app". */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  return {
    /** está rodando como app (aberto pelo ícone) */
    installed: isStandalone(),
    /** acabou de instalar, ou já está instalado neste celular (visto pelo navegador) */
    alreadyInstalled: installedNow || relatedInstalled,
    canPrompt: !!deferred,
    /** Mostra o convite nativo (espera até 1,5 s por ele). Devolve null se não existe convite. */
    async prompt(): Promise<boolean | null> {
      if (!(await waitForPrompt(1500)) || !deferred) return null;
      const d = deferred;
      await d.prompt();
      const { outcome } = await d.userChoice;
      deferred = null;
      notify();
      return outcome === 'accepted';
    },
  };
}
