import { useEffect, useState } from 'react';
import { ArrowRight, Flame, Sparkles } from 'lucide-react';
import type { StoreSettings } from '../types';

interface FlashDropBannerProps {
  settings: StoreSettings;
  newestActive: boolean;
  onActivateNewest: () => void;
}

function getRemainingParts(endsAt?: string | null) {
  if (!endsAt) return null;
  const target = new Date(endsAt).getTime();
  if (!Number.isFinite(target)) return null;
  const diff = Math.max(0, target - Date.now());
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400_000);
  const h = Math.floor((diff % 86400_000) / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return {
    d: String(d).padStart(2, '0'),
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(s).padStart(2, '0'),
  };
}

export function FlashDropBanner({
  settings,
  newestActive,
  onActivateNewest,
}: FlashDropBannerProps) {
  const [countdown, setCountdown] = useState(() => getRemainingParts(settings.flash_ends_at));

  useEffect(() => {
    setCountdown(getRemainingParts(settings.flash_ends_at));
    if (!settings.flash_ends_at) return;
    const t = setInterval(() => {
      setCountdown(getRemainingParts(settings.flash_ends_at));
    }, 1000);
    return () => clearInterval(t);
  }, [settings.flash_ends_at]);

  if (!settings.flash_enabled) return null;

  return (
    <section className="flash-drop-banner" aria-label="Recién llegados y ofertas flash">
      <div className="flash-drop__left">
        <span className="flash-drop__badge">
          <Flame size={13} />
          <span>{settings.flash_badge || 'NUEVO DROP'}</span>
        </span>
        <div className="flash-drop__copy">
          <strong>{settings.flash_title || 'Recién Llegados · Drop de la Semana'}</strong>
          <span>
            {settings.flash_subtitle ||
              'Modelos recién agregados en calzado 3A/G5, Shein y accesorios'}
          </span>
        </div>
      </div>

      <div className="flash-drop__right">
        {countdown && (
          <div className="flash-drop__timer" aria-label="Tiempo restante del drop">
            <span>
              <strong>{countdown.d}</strong>d
            </span>
            <span>
              <strong>{countdown.h}</strong>h
            </span>
            <span>
              <strong>{countdown.m}</strong>m
            </span>
            <span>
              <strong>{countdown.s}</strong>s
            </span>
          </div>
        )}
        <button
          type="button"
          className={`flash-drop__cta${newestActive ? ' is-active' : ''}`}
          onClick={onActivateNewest}
        >
          <Sparkles size={14} />
          <span>{newestActive ? 'Viendo recién llegados' : 'Ver recién llegados'}</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}
