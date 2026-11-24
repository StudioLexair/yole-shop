import { Component, type ErrorInfo, type ReactNode } from 'react';
import { purgeStaleCachesAndReload } from '../lib/lazySafe';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || '' };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Error handled cleanly via fallback UI instead of leaving a black screen
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'var(--bg, #0b0b0c)',
          color: 'var(--ink, #f4f4f5)',
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            padding: 24,
            borderRadius: 16,
            background: 'var(--surface, #141416)',
            border: '1px solid var(--border, #27272a)',
            display: 'grid',
            gap: 14,
          }}
        >
          <strong style={{ fontSize: 18 }}>Se detectó una actualización pendiente</strong>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted, #a1a1aa)', lineHeight: 1.5 }}>
            Para evitar pantallas en blanco o negras tras un cambio reciente, limpia la caché
            y carga la versión más reciente.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => void purgeStaleCachesAndReload()}
          >
            Recargar tienda actualizada
          </button>
        </div>
      </main>
    );
  }
}
