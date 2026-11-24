import { useEffect, useState } from 'react';

interface SplashLoaderProps {
  visible: boolean;
  label?: string;
  productCount?: number;
}

const PHASES = [
  'Encendiendo catálogo oficial...',
  'Verificando tallas reales y precios CUP / USD...',
  'Colección verificada · Bienvenido a Yole Shop',
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

    const durationMs = 4250;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const ratio = Math.min(1, elapsed / durationMs);
      // Smooth easeOutCubic curve up to 99% until visible becomes false, then 100%
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
          <span>Santa Clara · Edición Oficial</span>
        </span>

        <div className="yole-splash__emblem">
          <svg className="yole-splash__ring" viewBox="0 0 132 132" aria-hidden="true">
            <circle className="yole-splash__ring-track" cx="66" cy="66" r="60" />
            <circle className="yole-splash__ring-arc" cx="66" cy="66" r="60" />
          </svg>
          <svg className="yole-splash__ring-inner" viewBox="0 0 132 132" aria-hidden="true">
            <circle className="yole-splash__ring-ember" cx="66" cy="66" r="51" />
          </svg>
          <span className="yole-splash__monogram yole-splash__monogram--img">
            <img src="/brand-mark.webp" alt="Yole Shop" width={88} height={88} />
          </span>
        </div>

        <div className="yole-splash__brand">
          <strong>YOLE SHOP</strong>
          <span>Calzado Urbano · Moda Shein · Accesorios</span>
        </div>

        <div className="yole-splash__pillars" aria-hidden="true">
          <span>{productCount > 0 ? `+${productCount} Artículos` : 'Calidad 3A & G5'}</span>
          <span>CUP / USD</span>
          <span>WhatsApp Directo</span>
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
