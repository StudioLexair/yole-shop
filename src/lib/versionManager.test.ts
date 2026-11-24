import { describe, expect, it } from 'vitest';
import { bumpSemver, compareSemver, evaluateUpdateState, parseSemver } from './versionManager';

describe('versionManager', () => {
  it('compara versiones semver correctamente', () => {
    expect(parseSemver('v1.2.10')).toEqual([1, 2, 10]);
    expect(compareSemver('1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(compareSemver('1.1.0', '1.1.0')).toBe(0);
    expect(compareSemver('1.0.5', '1.1.0')).toBeLessThan(0);
    expect(bumpSemver('1.1.0', 'patch')).toBe('1.1.1');
    expect(bumpSemver('1.1.4', 'minor')).toBe('1.2.0');
  });

  it('detecta actualización obligatoria cuando cambia el buildId o sube la versión mínima', () => {
    const resBuild = evaluateUpdateState({
      embedded: { version: '1.1.0', buildId: 'oldhash123' },
      manifest: {
        version: '1.1.0',
        buildId: 'newhash456',
        mandatory: true,
        title: 'Nueva versión lista',
      },
      remoteRelease: null,
    });
    expect(resBuild.updateAvailable).toBe(true);
    expect(resBuild.mandatory).toBe(true);
    expect(resBuild.source).toBe('manifest');

    const resPolicy = evaluateUpdateState({
      embedded: { version: '1.0.0', buildId: 'dev' },
      manifest: null,
      remoteRelease: {
        id: 'yole-shop',
        latest_version: '1.1.0',
        min_version: '1.1.0',
        mandatory: true,
        title: 'Actualización crítica',
        description: 'Nuevas mecánicas listas.',
        features: ['Logo oficial', 'Modo oscuro completo'],
      },
    });
    expect(resPolicy.updateAvailable).toBe(true);
    expect(resPolicy.mandatory).toBe(true);
    expect(resPolicy.source).toBe('remote-policy');
    expect(resPolicy.targetVersion).toBe('1.1.0');
  });

  it('no marca actualización falsa cuando la versión y build coinciden', () => {
    const ok = evaluateUpdateState({
      embedded: { version: '1.1.0', buildId: 'abc1234567' },
      manifest: { version: '1.1.0', buildId: 'abc1234567', mandatory: true },
      remoteRelease: {
        id: 'yole-shop',
        latest_version: '1.1.0',
        min_version: '1.1.0',
        mandatory: true,
        title: 'Al día',
        description: 'Todo al día',
        features: [],
      },
    });
    expect(ok.updateAvailable).toBe(false);
    expect(ok.source).toBe('uptodate');
  });
});
