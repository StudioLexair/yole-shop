import { useEffect, useState } from 'react';

interface SplashLoaderProps {
  visible: boolean;
  label?: string;
  productCount?: number;
}

const PHASES = [
  'Conectando con Yole Shop...',
  'Cargando Tenis, Moda, Motos y Equipos Solares...',
  'Catálogo completo listo · Bienvenido',
];

export function SplashLoader({
  visible,
  label,
  productCount = 0,
}: SplashLoaderProps) {
  const [percent, setPercent] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    if (!visible) {
      setPercent(100);
      setPhaseIdx(2);
      return;
    }

    const durationMs = 3600;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const ratio = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - ratio, 2.2);
      const nextPct = Math.min(100, Math.round(eased * 100));
      setPercent(nextPct);
      if (ratio < 0.34) setPhaseIdx(0);
      else if (ratio < 0.78) setPhaseIdx(1);
      else setPhaseIdx(2);

      if (ratio < 1) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [visible]);

  const activeMessage = phaseIdx === 2 && label ? label : PHASES[phaseIdx];

  return (
    <div
      className={`yole-splash${visible ? ' is-visible' : ' is-hidden'}`}
      aria-hidden={!visible}
      role="status"
      aria-label="Cargando Yole Shop"
    >
      <div className="yole-splash__grid-bg" aria-hidden="true" />
      <div className="yole-splash__aura" aria-hidden="true" />

      <div className="yole-splash__card">
        <span className="yole-splash__edition">
          <span className="yole-splash__edition-dot" aria-hidden="true" />
          <span>Santa Clara · Toda Cuba</span>
        </span>

        <div className="yole-splash__emblem yole-splash__emblem--clean">
          <div className="yole-splash__logo-halo" aria-hidden="true" />
          <span className="yole-splash__monogram yole-splash__monogram--hero">
            <img src="/brand-mark.webp" alt="Yole Shop" width={104} height={104} />
          </span>
        </div>

        <div className="yole-splash__brand">
          <strong>YOLE SHOP</strong>
          <span>Tenis · Moda Shein · Motos · Equipos Solares</span>
        </div>

        <div className="yole-splash__pillars" aria-hidden="true">
          <span>{productCount > 0 ? `+${productCount} Artículos` : '+430 Artículos'}</span>
          <span>CUP / USD</span>
          <span>5 Departamentos</span>
        </div>

        <div className="yole-splash__meter">
          <div className="yole-splash__progress" aria-hidden="true">
            <div
              className="yole-splash__bar"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="yole-splash__meta">
            <p className="yole-splash__text">{activeMessage}</p>
            <span className="yole-splash__pct">{percent}%</span>
          </div>
        </div>

        <p className="yole-splash__credit">Studio Lexair · Cuba</p>
      </div>
    </div>
  );
}
