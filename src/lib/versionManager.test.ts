import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  bumpSemver,
  compareSemver,
  evaluateUpdateState,
  isUpdateSuppressedForSession,
  markUpdateDismissed,
} from './versionManager';

describe('versionManager', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('compara versiones semver correctamente', () => {
    expect(compareSemver('1.1.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('1.3.0', '1.3.0')).toBe(0);
    expect(compareSemver('1.0.9', '1.1.0')).toBeLessThan(0);
    expect(bumpSemver('1.3.0', 'patch')).toBe('1.3.1');
    expect(bumpSemver('1.3.0', 'minor')).toBe('1.4.0');
  });

  it('detecta actualización no bloqueante cuando remoteRelease tiene nueva versión', () => {
    const state = evaluateUpdateState({
      embedded: { version: '1.1.0', buildId: 'abc123' },
      manifest: { version: '1.1.0', buildId: 'abc123' },
      remoteRelease: {
        id: 'yole-shop',
        latest_version: '1.3.0',
        min_version: '1.3.0',
        mandatory: false,
        title: '¡Actualización disponible!',
        description: 'Nuevas funciones.',
        features: ['Seguimiento QR', 'Cupones VIP'],
      },
      swWaiting: false,
    });

    expect(state.updateAvailable).toBe(true);
    expect(state.mandatory).toBe(false);
    expect(state.targetVersion).toBe('1.3.0');
    expect(state.features).toEqual(['Seguimiento QR', 'Cupones VIP']);
  });

  it('permite descartar la versión en sesión sin bucle infinito', () => {
    markUpdateDismissed('1.3.0');
    expect(isUpdateSuppressedForSession('1.3.0', '1.2.0')).toBe(true);
    expect(isUpdateSuppressedForSession('1.4.0', '1.2.0')).toBe(false);
  });

  it('reporta al día cuando versión y build coinciden', () => {
    const state = evaluateUpdateState({
      embedded: { version: '1.3.0', buildId: 'build99' },
      manifest: { version: '1.3.0', buildId: 'build99' },
      remoteRelease: {
        id: 'yole-shop',
        latest_version: '1.3.0',
        min_version: '1.0.0',
        mandatory: false,
        title: 'Actualización',
        description: 'Todo al día',
        features: [],
      },
      swWaiting: false,
    });

    expect(state.updateAvailable).toBe(false);
    expect(state.source).toBe('uptodate');
  });
});

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));
