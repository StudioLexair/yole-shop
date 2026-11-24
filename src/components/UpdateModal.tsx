import { useEffect, useState } from 'react';
import { ArrowRight, Check, RefreshCw, Sparkles, X } from 'lucide-react';
import {
  applyForcedAppUpdate,
  markUpdateDismissed,
  type EvaluatedUpdateState,
} from '../lib/versionManager';

interface UpdateModalProps {
  open: boolean;
  updateState: EvaluatedUpdateState | null;
  previewMode?: boolean;
  onClosePreview?: () => void;
}

export function UpdateModal({
  open,
  updateState,
  previewMode = false,
  onClosePreview,
}: UpdateModalProps) {
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !updating && onClosePreview) {
        if (!previewMode && updateState?.targetVersion) {
          markUpdateDismissed(updateState.targetVersion);
        }
        onClosePreview();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, updating, onClosePreview, previewMode, updateState?.targetVersion]);

  if (!open || !updateState) return null;

  const handleClose = () => {
    if (updating) return;
    if (!previewMode && updateState.targetVersion) {
      markUpdateDismissed(updateState.targetVersion);
    }
    onClosePreview?.();
  };

  const handleUpdate = async () => {
    setUpdating(true);
    await applyForcedAppUpdate();
  };

  return (
    <div
      className="yole-update-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <section
        className="yole-update-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="yole-update-title"
        aria-describedby="yole-update-desc"
      >
        <button
          type="button"
          className="yole-update-close"
          onClick={handleClose}
          disabled={updating}
          aria-label="Cerrar aviso de actualización"
        >
          <X size={18} />
        </button>

        <div className="yole-update-hero">
          <div className="yole-update-glow" aria-hidden="true" />
          <div className="yole-update-emblem">
            <img src="/brand-mark.webp" alt="Yole Shop" width={72} height={72} />
          </div>
          <div className="yole-update-badges">
            <span className="yole-update-pill">
              <span className="yole-update-dot" aria-hidden="true" />
              Nueva versión lista
            </span>
            <span className="yole-update-ver">
              v{updateState.currentVersion} → v{updateState.targetVersion}
            </span>
          </div>
        </div>

        <div className="yole-update-body">
          <h2 id="yole-update-title">{updateState.title}</h2>
          <p id="yole-update-desc" className="yole-update-desc">
            {updateState.description}
          </p>

          <div className="yole-update-features-box">
            <div className="yole-update-features-head">
              <Sparkles size={14} />
              <span>Novedades y mejoras incluidas</span>
            </div>
            <ul className="yole-update-features">
              {updateState.features.slice(0, 4).map((feat) => (
                <li key={feat}>
                  <span className="yole-update-check" aria-hidden="true">
                    <Check size={12} />
                  </span>
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            className={`yole-update-cta${updating ? ' is-loading' : ''}`}
            disabled={updating}
            onClick={() => void handleUpdate()}
          >
            <RefreshCw size={18} className={updating ? 'is-spinning' : ''} />
            <span>
              {updating
                ? 'Descargando nueva versión...'
                : 'Actualizar ahora'}
            </span>
            {!updating && <ArrowRight size={17} />}
          </button>

          <button
            type="button"
            className="yole-update-skip"
            disabled={updating}
            onClick={handleClose}
          >
            {previewMode ? 'Cerrar vista previa' : 'Más tarde'}
          </button>
        </div>
      </section>
    </div>
  );
}
