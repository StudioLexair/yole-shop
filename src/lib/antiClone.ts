// Protección contra clonación, descargas offline no autorizadas y framing malicioso.
// Nivel de seguridad alineado con Studio Lexair.

const OFFICIAL_URL = 'https://yoleshop.ddns.net/';

const ALLOWED_HOST_SUFFIXES = [
  'yoleshop.ddns.net',
  'yole-shop.pages.dev',
  'yole-shop.vercel.app',
];

const ALLOWED_EMBED_HOSTS = [
  'studiolexair.ddns.net',
  'studiolexair.pages.dev',
  'studio-lexair.vercel.app',
  'yoleshop.ddns.net',
  'yole-shop.pages.dev',
  'yole-shop.vercel.app',
];

const CLONER_SIGNATURES = [
  'httrack',
  'saveweb2zip',
  'webcopy',
  'teleport pro',
  'offline explorer',
  'sitesucker',
  'cyotek',
  'webzip',
];

export function isAuthorizedHost(hostname: string, isDev = false): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (isDev && (host === 'localhost' || host === '127.0.0.1' || host === '::1')) {
    return true;
  }
  if (ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) {
    return true;
  }
  // Vistas previas propias de Vercel para yole-shop
  if (host.startsWith('yole-shop-') && host.endsWith('.vercel.app')) {
    return true;
  }
  return false;
}

export function isAllowedEmbedOrigin(referrerOrOrigin: string): boolean {
  if (!referrerOrOrigin) return false;
  try {
    const u = new URL(referrerOrOrigin);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return ALLOWED_EMBED_HOSTS.some((s) => h === s || h.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

export function hasClonerSignatures(): boolean {
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    if (CLONER_SIGNATURES.some((sig) => ua.includes(sig))) return true;
  }
  if (typeof document !== 'undefined') {
    const htmlHead = document.documentElement?.innerHTML.slice(0, 1600).toLowerCase() ?? '';
    if (htmlHead.includes('mirrored from') || htmlHead.includes('httrack website copier')) {
      return true;
    }
  }
  return false;
}

export function evaluateRuntimeIntegrity(): { ok: boolean; reason: string } {
  if (typeof window === 'undefined') return { ok: true, reason: '' };
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return { ok: true, reason: '' };
  }
  if (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom')) {
    return { ok: true, reason: '' };
  }

  const { protocol, hostname } = window.location;
  if (protocol === 'file:' || protocol !== 'https:') {
    return { ok: false, reason: 'protocol' };
  }
  if (!isAuthorizedHost(hostname, false)) {
    return { ok: false, reason: 'host' };
  }

  try {
    if (window.self !== window.top) {
      const parentOrigin = document.referrer || '';
      const sameOrigin = (() => {
        try {
          return window.top?.location.origin === window.location.origin;
        } catch {
          return false;
        }
      })();
      if (!sameOrigin && !isAllowedEmbedOrigin(parentOrigin)) {
        return { ok: false, reason: 'frame' };
      }
    }
  } catch {
    const parentOrigin = typeof document !== 'undefined' ? document.referrer : '';
    if (!isAllowedEmbedOrigin(parentOrigin)) {
      return { ok: false, reason: 'frame' };
    }
  }

  if (hasClonerSignatures()) {
    return { ok: false, reason: 'cloner' };
  }

  return { ok: true, reason: '' };
}

function renderBlockedNotice(): void {
  const root = document.getElementById('root') || document.body;
  if (!root) return;
  root.innerHTML = '';

  const wrap = document.createElement('main');
  wrap.style.cssText =
    'min-height:100vh;display:grid;place-items:center;padding:24px;background:#0a0a0a;color:#f4f4f5;font-family:system-ui,sans-serif;text-align:center;';

  const card = document.createElement('div');
  card.style.cssText =
    'max-width:440px;padding:28px;border-radius:16px;background:#141416;border:1px solid #27272a;display:grid;gap:14px;';

  const title = document.createElement('h1');
  title.textContent = 'Acceso protegido · Yole Shop';
  title.style.cssText = 'margin:0;font-size:1.25rem;font-weight:700;';

  const desc = document.createElement('p');
  desc.textContent =
    'Esta tienda online está protegida por Studio Lexair. Entra directamente desde el dominio oficial para explorar el catálogo.';
  desc.style.cssText = 'margin:0;color:#a1a1aa;font-size:0.95rem;line-height:1.5;';

  const link = document.createElement('a');
  link.href = OFFICIAL_URL;
  link.textContent = 'Ir a yoleshop.ddns.net';
  link.style.cssText =
    'display:inline-flex;justify-content:center;align-items:center;min-height:44px;padding:0 18px;border-radius:12px;background:#fafafa;color:#0a0a0a;font-weight:700;text-decoration:none;';

  card.append(title, desc, link);
  wrap.appendChild(card);
  root.appendChild(wrap);
}

export function enforceOriginLock(): void {
  const check = evaluateRuntimeIntegrity();
  if (check.ok) return;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderBlockedNotice, { once: true });
    } else {
      renderBlockedNotice();
    }
  }
  throw new Error(`Unauthorized access (${check.reason})`);
}
