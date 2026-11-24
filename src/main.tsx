import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { enforceOriginLock } from './lib/antiClone';
import { purgeStaleCachesAndReload } from './lib/lazySafe';
import './styles.css';

// Bloquea ejecución en clones o en el enlace espejo yole-shop.pages.dev antes de hidratar.
enforceOriginLock();

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const guardKey = 'yole_preload_reload_at';
    const last = Number(window.sessionStorage.getItem(guardKey) || 0);
    if (Date.now() - last > 12_000) {
      window.sessionStorage.setItem(guardKey, String(Date.now()));
      void purgeStaleCachesAndReload();
    }
  });

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
