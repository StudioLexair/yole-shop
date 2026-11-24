import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { enforceOriginLock } from './lib/antiClone';
import './styles.css';

// Bloquea ejecución en clones o copias descargadas no autorizadas antes de hidratar.
enforceOriginLock();

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
