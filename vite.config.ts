import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

function readJsonRecord(relPath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), relPath), 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function collectFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? collectFiles(full) : [full];
    });
}

function computeSourceHash(root: string): string {
  try {
    const hash = createHash('sha1');
    for (const rel of ['package.json', 'index.html', 'public/sw.js', 'src']) {
      const target = resolve(root, rel);
      if (!existsSync(target)) continue;
      if (statSync(target).isDirectory()) {
        for (const f of collectFiles(target)) {
          hash.update(relative(root, f).split(sep).join('/'));
          hash.update(readFileSync(f));
        }
      } else {
        hash.update(rel);
        hash.update(readFileSync(target));
      }
    }
    return hash.digest('hex').slice(0, 10);
  } catch {
    return 'local';
  }
}

function yoleVersionPlugin(version: string, buildId: string): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  return {
    name: 'yole-version-manifest',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    closeBundle() {
      const base = readJsonRecord('public/version.json');
      const manifest = {
        version,
        buildId,
        releasedAt: new Date().toISOString(),
        mandatory: typeof base.mandatory === 'boolean' ? base.mandatory : true,
        title: typeof base.title === 'string' && base.title.trim() ? base.title.trim() : '¡Actualización disponible!',
        description:
          typeof base.description === 'string' && base.description.trim()
            ? base.description.trim()
            : 'Actualiza Yole Shop para cargar las nuevas funciones y mejoras del catálogo.',
        features: Array.isArray(base.features) ? base.features : [],
      };
      writeFileSync(resolve(root, outDir, 'version.json'), JSON.stringify(manifest, null, 2) + '\n');
    },
  };
}

const pkg = readJsonRecord('package.json');
const appVersion = typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : '1.1.0';
const buildId = computeSourceHash(process.cwd());

export default defineConfig({
  plugins: [react(), yoleVersionPlugin(appVersion, buildId)],
  define: {
    __YOLE_VERSION__: JSON.stringify(appVersion),
    __YOLE_BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
