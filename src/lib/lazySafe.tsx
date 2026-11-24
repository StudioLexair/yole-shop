import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_GUARD_KEY = 'yole_chunk_reload_at';

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /dynamically imported module|ChunkLoadError|Loading chunk|Failed to fetch/i.test(msg);
}

export async function purgeStaleCachesAndReload(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ('caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((k) => window.caches.delete(k).catch(() => false)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
    }
  } catch {
    // ignore cleanup errors
  }
  window.location.reload();
}

export function lazySafe<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  options?: { optional?: boolean }
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await importer();
    } catch (err) {
      if (options?.optional) {
        // Optional UI overlays (such as UpdateModal) silently degrade instead of crashing the shell
        return { default: (() => null) as unknown as T };
      }

      if (typeof window !== 'undefined' && isChunkLoadError(err)) {
        const last = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
        const now = Date.now();
        if (now - last > 12_000) {
          window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
          await purgeStaleCachesAndReload();
          return { default: (() => null) as unknown as T };
        }
      }
      throw err;
    }
  });
}
