import type { AppRelease } from '../types';
import { supabase } from './supabase';

export interface VersionManifest {
  version: string;
  buildId: string;
  releasedAt?: string;
  mandatory?: boolean;
  title?: string;
  description?: string;
  features?: string[];
}

export interface EmbeddedVersionInfo {
  version: string;
  buildId: string;
}

export interface EvaluatedUpdateState {
  updateAvailable: boolean;
  mandatory: boolean;
  currentVersion: string;
  currentBuildId: string;
  targetVersion: string;
  targetBuildId?: string;
  title: string;
  description: string;
  features: string[];
  releasedAt?: string;
  source: 'manifest' | 'remote-policy' | 'service-worker' | 'uptodate';
  manifest: VersionManifest | null;
  remoteRelease: AppRelease | null;
}

const FALLBACK_FEATURES = [
  'Nuevas funciones y mejoras visuales en el catálogo',
  'Optimización de velocidad, caché y búsqueda inteligente',
  'Precios y disponibilidad sincronizados al día',
];

export function getEmbeddedVersionInfo(): EmbeddedVersionInfo {
  const version =
    typeof __YOLE_VERSION__ === 'string' && __YOLE_VERSION__.trim()
      ? __YOLE_VERSION__.trim()
      : '1.1.0';
  const buildId =
    typeof __YOLE_BUILD_ID__ === 'string' && __YOLE_BUILD_ID__.trim()
      ? __YOLE_BUILD_ID__.trim()
      : 'dev';
  return { version, buildId };
}

export function parseSemver(version?: string | null): [number, number, number] | null {
  if (!version) return null;
  const match = version
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemver(a?: string | null, b?: string | null): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function bumpSemver(version: string, part: 'patch' | 'minor' = 'patch'): string {
  const parsed = parseSemver(version) ?? [1, 1, 0];
  if (part === 'minor') return `${parsed[0]}.${parsed[1] + 1}.0`;
  return `${parsed[0]}.${parsed[1]}.${parsed[2] + 1}`;
}

export async function fetchManifestVersion(): Promise<VersionManifest | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const raw = (await res.json()) as Partial<VersionManifest> | null;
    if (!raw || typeof raw !== 'object' || typeof raw.version !== 'string') return null;
    return {
      version: raw.version.trim(),
      buildId: typeof raw.buildId === 'string' ? raw.buildId.trim() : '',
      releasedAt: typeof raw.releasedAt === 'string' ? raw.releasedAt.trim() : undefined,
      mandatory: typeof raw.mandatory === 'boolean' ? raw.mandatory : true,
      title: typeof raw.title === 'string' ? raw.title.trim() : undefined,
      description: typeof raw.description === 'string' ? raw.description.trim() : undefined,
      features: Array.isArray(raw.features)
        ? raw.features.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
        : undefined,
    };
  } catch {
    return null;
  }
}

export async function fetchRemoteRelease(): Promise<AppRelease | null> {
  try {
    if (!supabase || typeof supabase.from !== 'function') return null;
    const { data, error } = await supabase
      .from('app_releases')
      .select('*')
      .eq('id', 'yole-shop')
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: String(row.id || 'yole-shop'),
      latest_version: String(row.latest_version || '').trim(),
      min_version: String(row.min_version || '').trim(),
      mandatory: row.mandatory !== false,
      title: String(row.title || '¡Actualización disponible!'),
      description: String(
        row.description ||
          'Actualiza Yole Shop para cargar las nuevas funciones, diseño mejorado y catálogo al día.'
      ),
      features: Array.isArray(row.features)
        ? row.features.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
        : [],
      released_at: typeof row.released_at === 'string' ? row.released_at : undefined,
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
    };
  } catch {
    return null;
  }
}

export async function saveRemoteRelease(
  patch: Pick<
    AppRelease,
    'latest_version' | 'min_version' | 'mandatory' | 'title' | 'description' | 'features'
  >
): Promise<AppRelease> {
  const payload = {
    id: 'yole-shop',
    latest_version: patch.latest_version.trim(),
    min_version: patch.min_version.trim() || patch.latest_version.trim(),
    mandatory: Boolean(patch.mandatory),
    title: patch.title.trim() || '¡Actualización disponible!',
    description:
      patch.description.trim() ||
      'Actualiza Yole Shop para cargar las nuevas funciones y el catálogo al día.',
    features: patch.features.map((f) => f.trim()).filter(Boolean),
    released_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('app_releases')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as AppRelease;
}

export function evaluateUpdateState(input: {
  embedded: EmbeddedVersionInfo;
  manifest: VersionManifest | null;
  remoteRelease: AppRelease | null;
  swWaiting?: boolean;
}): EvaluatedUpdateState {
  const { embedded, manifest, remoteRelease, swWaiting = false } = input;
  const isDevLocal = embedded.buildId === 'dev' || embedded.buildId === 'local';

  const manifestBuildChanged = Boolean(
    !isDevLocal &&
      manifest?.buildId &&
      manifest.buildId !== 'local' &&
      manifest.buildId !== 'dev' &&
      manifest.buildId !== embedded.buildId
  );

  const manifestSemverNewer = Boolean(
    manifest?.version && compareSemver(manifest.version, embedded.version) > 0
  );

  const minVersionRequired = Boolean(
    remoteRelease?.min_version && compareSemver(remoteRelease.min_version, embedded.version) > 0
  );

  const latestVersionNewer = Boolean(
    remoteRelease?.latest_version &&
      compareSemver(remoteRelease.latest_version, embedded.version) > 0
  );

  const updateAvailable = Boolean(
    manifestBuildChanged ||
      manifestSemverNewer ||
      minVersionRequired ||
      latestVersionNewer ||
      swWaiting
  );

  let source: EvaluatedUpdateState['source'] = 'uptodate';
  if (minVersionRequired || latestVersionNewer) source = 'remote-policy';
  else if (manifestBuildChanged || manifestSemverNewer) source = 'manifest';
  else if (swWaiting) source = 'service-worker';

  const targetVersion =
    remoteRelease && compareSemver(remoteRelease.latest_version, manifest?.version || embedded.version) >= 0
      ? remoteRelease.latest_version || embedded.version
      : manifest?.version || embedded.version;

  const mandatory = Boolean(
    minVersionRequired || (remoteRelease ? remoteRelease.mandatory : manifest?.mandatory ?? true)
  );

  const useRemoteCopy = Boolean(
    remoteRelease &&
      (minVersionRequired ||
        latestVersionNewer ||
        compareSemver(remoteRelease.latest_version, targetVersion) === 0)
  );

  const title =
    (useRemoteCopy && remoteRelease?.title) ||
    manifest?.title ||
    '¡Actualización disponible!';
  const description =
    (useRemoteCopy && remoteRelease?.description) ||
    manifest?.description ||
    'Hay una nueva versión de Yole Shop lista con nuevas funciones, mejoras visuales y datos al día. Actualiza para continuar.';
  const features =
    (useRemoteCopy && remoteRelease?.features?.length ? remoteRelease.features : null) ||
    (manifest?.features?.length ? manifest.features : null) ||
    FALLBACK_FEATURES;

  return {
    updateAvailable,
    mandatory,
    currentVersion: embedded.version,
    currentBuildId: embedded.buildId,
    targetVersion,
    targetBuildId: manifest?.buildId,
    title,
    description,
    features,
    releasedAt: remoteRelease?.released_at || manifest?.releasedAt,
    source,
    manifest,
    remoteRelease,
  };
}

export async function checkAppUpdate(): Promise<EvaluatedUpdateState> {
  const embedded = getEmbeddedVersionInfo();
  const [manifest, remoteRelease, swWaiting] = await Promise.all([
    fetchManifestVersion(),
    fetchRemoteRelease(),
    detectWaitingServiceWorker(),
  ]);

  return evaluateUpdateState({ embedded, manifest, remoteRelease, swWaiting });
}

async function detectWaitingServiceWorker(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    await reg.update().catch(() => undefined);
    return Boolean(reg.waiting);
  } catch {
    return false;
  }
}

export async function applyForcedAppUpdate(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'PURGE_AND_UPDATE' });
      } else if (reg?.active) {
        reg.active.postMessage({ type: 'PURGE_AND_UPDATE' });
      }
      await reg?.update().catch(() => undefined);
    }
  } catch {
    /* continúa limpiando cachés directamente */
  }

  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith('yole-media-'))
          .map((k) => window.caches.delete(k).catch(() => false))
      );
    }
  } catch {
    /* modo privado sin CacheStorage */
  }

  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    url.searchParams.set('_upd', String(Date.now()));
    window.location.replace(url.toString());
  }
}
