// Protección contra clonación, descargas offline no autorizadas, espejos bloqueados y framing malicioso.
// Nivel de seguridad alineado con Studio Lexair.

const OFFICIAL_ORIGIN = 'https://yoleshop.ddns.net';

const ALLOWED_HOST_SUFFIXES = ['yoleshop.ddns.net', 'yole-shop.vercel.app'];

const BLOCKED_MIRROR_SUFFIXES = ['yole-shop.pages.dev'];

const ALLOWED_EMBED_HOSTS = [
  'studiolexair.ddns.net',
  'studiolexair.pages.dev',
  'studio-lexair.vercel.app',
  'yoleshop.ddns.net',
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

export function isBlockedMirrorHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  return BLOCKED_MIRROR_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

export function buildOfficialRedirectUrl(loc?: {
  pathname?: string;
  search?: string;
  hash?: string;
}): string {
  const path = loc?.pathname || '/';
  const search = loc?.search || '';
  const hash = loc?.hash || '';
  return `${OFFICIAL_ORIGIN}${path.startsWith('/') ? path : `/${path}`}${search}${hash}`;
}

export function isAuthorizedHost(hostname: string, isDev = false): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (isDev && (host === 'localhost' || host === '127.0.0.1' || host === '::1')) {
    return true;
  }
  if (isBlockedMirrorHost(host)) {
    return false;
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
  if (isBlockedMirrorHost(hostname)) {
    return { ok: false, reason: 'mirror' };
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

function renderBlockedNotice(reason: string): void {
  const root = document.getElementById('root') || document.body;
  if (!root) return;
  root.innerHTML = '';

  const isMirror = reason === 'mirror';
  const targetUrl =
    typeof window !== 'undefined'
      ? buildOfficialRedirectUrl(window.location)
      : `${OFFICIAL_ORIGIN}/`;

  const wrap = document.createElement('main');
  wrap.style.cssText =
    'min-height:100vh;display:grid;place-items:center;padding:24px;background:#0a0a0a;color:#f4f4f5;font-family:system-ui,sans-serif;text-align:center;';

  const card = document.createElement('div');
  card.style.cssText =
    'max-width:460px;width:100%;padding:28px;border-radius:18px;background:#141416;border:1px solid #27272a;display:grid;gap:14px;box-shadow:0 24px 60px rgba(0,0,0,0.55);';

  const badge = document.createElement('span');
  badge.textContent = isMirror ? 'ENLACE RESTRINGIDO · REDIRECCIÓN OFICIAL' : 'ACCESO PROTEGIDO';
  badge.style.cssText =
    'justify-self:center;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:0.06em;background:rgba(245,158,11,0.16);color:#fbbf24;border:1px solid rgba(245,158,11,0.35);';

  const title = document.createElement('h1');
  title.textContent = isMirror
    ? 'Yole Shop ahora opera únicamente en yoleshop.ddns.net'
    : 'Acceso protegido · Yole Shop';
  title.style.cssText = 'margin:0;font-size:1.25rem;font-weight:800;line-height:1.3;';

  const desc = document.createElement('p');
  desc.textContent = isMirror
    ? 'Este enlace espejo (yole-shop.pages.dev) fue bloqueado por seguridad. Te estamos redirigiendo automáticamente a nuestra dirección oficial.'
    : 'Esta tienda online está protegida por Studio Lexair. Entra directamente desde el dominio oficial para explorar el catálogo.';
  desc.style.cssText = 'margin:0;color:#a1a1aa;font-size:0.94rem;line-height:1.55;';

  const countdown = document.createElement('p');
  countdown.style.cssText = 'margin:0;font-size:0.85rem;color:#34d399;font-weight:700;';
  let secs = 3;
  if (isMirror) {
    countdown.textContent = `Redirigiendo a yoleshop.ddns.net en ${secs}s...`;
  }

  const link = document.createElement('a');
  link.href = targetUrl;
  link.textContent = 'Ir ahora a yoleshop.ddns.net';
  link.style.cssText =
    'display:inline-flex;justify-content:center;align-items:center;min-height:46px;padding:0 20px;border-radius:12px;background:#fafafa;color:#0a0a0a;font-weight:800;text-decoration:none;font-size:0.95rem;';

  card.append(badge, title, desc);
  if (isMirror) card.append(countdown);
  card.append(link);
  wrap.appendChild(card);
  root.appendChild(wrap);

  if (isMirror && typeof window !== 'undefined') {
    const iv = window.setInterval(() => {
      secs -= 1;
      if (secs > 0) {
        countdown.textContent = `Redirigiendo a yoleshop.ddns.net en ${secs}s...`;
      } else {
        window.clearInterval(iv);
        countdown.textContent = 'Abriendo tienda oficial...';
      }
    }, 800);
    window.setTimeout(() => {
      window.clearInterval(iv);
      window.location.replace(targetUrl);
    }, 2400);
  }
}

export function enforceOriginLock(): void {
  const check = evaluateRuntimeIntegrity();
  if (check.ok) return;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => renderBlockedNotice(check.reason), {
        once: true,
      });
    } else {
      renderBlockedNotice(check.reason);
    }
  }
  throw new Error(`Unauthorized access (${check.reason})`);
}
