interface SplashLoaderProps {
  visible: boolean;
  label?: string;
}

export function SplashLoader({ visible, label = 'Preparando colección...' }: SplashLoaderProps) {
  return (
    <div
      className={`yole-splash${visible ? ' is-visible' : ' is-hidden'}`}
      aria-hidden={!visible}
      role="status"
      aria-label="Cargando Yole Shop"
    >
      <div className="yole-splash__card">
        <div className="yole-splash__emblem">
          <svg className="yole-splash__ring" viewBox="0 0 96 96" aria-hidden="true">
            <circle className="yole-splash__ring-track" cx="48" cy="48" r="43" />
            <circle className="yole-splash__ring-arc" cx="48" cy="48" r="43" />
          </svg>
          <span className="yole-splash__monogram">YS</span>
        </div>

        <div className="yole-splash__brand">
          <strong>YOLE SHOP</strong>
          <span>Calzado Urbano · Moda Shein</span>
        </div>

        <div className="yole-splash__progress" aria-hidden="true">
          <div className="yole-splash__bar" />
        </div>

        <p className="yole-splash__text">{label}</p>
      </div>
    </div>
  );
}
