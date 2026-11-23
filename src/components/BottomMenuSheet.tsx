import { useState } from 'react';
import {
  Check,
  ChevronRight,
  Download,
  Heart,
  Lock,
  MapPin,
  MessageCircle,
  Moon,
  Smartphone,
  Sun,
  Truck,
  X,
} from 'lucide-react';
import type { Currency, Department, StoreSettings } from '../types';
import type { ThemeMode } from '../lib/catalog';
import { formatCup } from '../lib/pricing';

interface BottomMenuSheetProps {
  open: boolean;
  onClose: () => void;
  settings: StoreSettings;
  department: Department | 'all';
  sheinGender: 'all' | 'mujer' | 'hombre';
  deptCounts: {
    all: number;
    calzado: number;
    moda_shein: number;
    hombre: number;
    accesorios: number;
  };
  displayCurrency: Currency;
  themeMode?: ThemeMode;
  onToggleTheme?: () => void;
  favoriteCount?: number;
  onlyFavorites?: boolean;
  onToggleFavorites?: () => void;
  onSelectDept: (dep: Department | 'all') => void;
  onSelectSheinGender: (g: 'all' | 'mujer' | 'hombre') => void;
  onChangeCurrency: (c: Currency) => void;
  onOpenAdmin: () => void;
  directWaUrl: string;
  canPromptInstall: boolean;
  isInstalled: boolean;
  onInstallApp: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function BottomMenuSheet({
  open,
  onClose,
  settings,
  department,
  sheinGender,
  deptCounts,
  displayCurrency,
  themeMode = 'light',
  onToggleTheme,
  favoriteCount = 0,
  onlyFavorites = false,
  onToggleFavorites,
  onSelectDept,
  onSelectSheinGender,
  onChangeCurrency,
  onOpenAdmin,
  directWaUrl,
  canPromptInstall,
  isInstalled,
  onInstallApp,
}: BottomMenuSheetProps) {
  const [showManualInstall, setShowManualInstall] = useState(false);

  if (!open) return null;

  const pickDept = (dep: Department | 'all') => {
    onSelectDept(dep);
    onClose();
  };

  const pickShein = (g: 'all' | 'mujer' | 'hombre') => {
    if (department !== 'moda_shein') {
      onSelectDept('moda_shein');
    }
    onSelectSheinGender(g);
    onClose();
  };

  const handleInstallClick = async () => {
    const res = await onInstallApp();
    if (res === 'unavailable') {
      setShowManualInstall((v) => !v);
    } else if (res === 'accepted') {
      setShowManualInstall(false);
      onClose();
    }
  };

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Menú principal"
      onClick={onClose}
    >
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle-wrap" aria-hidden="true">
          <span className="sheet-handle" />
        </div>

        <header className="sheet-head">
          <div className="brand-mark">
            <span className="brand-monogram">YS</span>
            <div>
              <strong>{settings.store_name.toUpperCase()}</strong>
              <small>{settings.location_text}</small>
            </div>
          </div>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </header>

        <div className="sheet-body">
          {/* Resumen tienda y envío */}
          <div className="sheet-info-bar">
            <span>
              <MapPin size={13} /> {settings.location_text}
            </span>
            <span>
              <Truck size={13} /> Domicilio base {formatCup(settings.delivery_fee_cup)}
            </span>
          </div>

          {/* Colecciones */}
          <div className="sheet-section">
            <span className="sheet-label">Explorar tienda</span>
            <div className="sheet-nav-list">
              <button
                type="button"
                className={`sheet-nav-item${department === 'all' ? ' is-active' : ''}`}
                onClick={() => pickDept('all')}
              >
                <span>Todo el catálogo</span>
                <span className="sheet-nav-right">
                  <strong>{deptCounts.all}</strong>
                  <ChevronRight size={16} />
                </span>
              </button>

              <button
                type="button"
                className={`sheet-nav-item${department === 'calzado' ? ' is-active' : ''}`}
                onClick={() => pickDept('calzado')}
              >
                <span>Calzado &amp; Tenis</span>
                <span className="sheet-nav-right">
                  <strong>{deptCounts.calzado}</strong>
                  <ChevronRight size={16} />
                </span>
              </button>

              <div className="sheet-shein-group">
                <button
                  type="button"
                  className={`sheet-nav-item${department === 'moda_shein' && sheinGender === 'all' ? ' is-active' : ''}`}
                  onClick={() => pickShein('all')}
                >
                  <span>Moda Shein (Mujer &amp; Hombre)</span>
                  <span className="sheet-nav-right">
                    <strong>{deptCounts.moda_shein + deptCounts.hombre}</strong>
                    <ChevronRight size={16} />
                  </span>
                </button>
                <div className="sheet-subpills">
                  <button
                    type="button"
                    className={`chip${department === 'moda_shein' && sheinGender === 'mujer' ? ' is-active' : ''}`}
                    onClick={() => pickShein('mujer')}
                  >
                    Mujer ({deptCounts.moda_shein})
                  </button>
                  <button
                    type="button"
                    className={`chip${department === 'moda_shein' && sheinGender === 'hombre' ? ' is-active' : ''}`}
                    onClick={() => pickShein('hombre')}
                  >
                    Hombre ({deptCounts.hombre})
                  </button>
                </div>
              </div>

              <button
                type="button"
                className={`sheet-nav-item${department === 'accesorios' ? ' is-active' : ''}`}
                onClick={() => pickDept('accesorios')}
              >
                <span>Accesorios</span>
                <span className="sheet-nav-right">
                  <strong>{deptCounts.accesorios}</strong>
                  <ChevronRight size={16} />
                </span>
              </button>

              {onToggleFavorites && (
                <button
                  type="button"
                  className={`sheet-nav-item${onlyFavorites ? ' is-active' : ''}`}
                  onClick={() => {
                    onToggleFavorites();
                    onClose();
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <Heart size={15} fill={onlyFavorites ? 'currentColor' : 'none'} />
                    Favoritos guardados
                  </span>
                  <span className="sheet-nav-right">
                    <strong>{favoriteCount}</strong>
                    <ChevronRight size={16} />
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Moneda y Apariencia */}
          <div className="sheet-section">
            <div className="sheet-row-between">
              <div>
                <span className="sheet-label" style={{ marginBottom: 2 }}>
                  Moneda en pantalla
                </span>
                <small style={{ color: 'var(--muted)', fontSize: 12 }}>
                  1 USD = {formatCup(settings.usd_to_cup_rate)}
                </small>
              </div>
              <div className="curr-toggle">
                <button
                  type="button"
                  className={displayCurrency === 'CUP' ? 'is-active' : ''}
                  onClick={() => onChangeCurrency('CUP')}
                >
                  CUP
                </button>
                <button
                  type="button"
                  className={displayCurrency === 'USD' ? 'is-active' : ''}
                  onClick={() => onChangeCurrency('USD')}
                >
                  USD
                </button>
              </div>
            </div>

            {onToggleTheme && (
              <div className="sheet-row-between">
                <div>
                  <span className="sheet-label" style={{ marginBottom: 2 }}>
                    Tema de la tienda
                  </span>
                  <small style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {themeMode === 'dark' ? 'Modo Oscuro elegante' : 'Modo Claro editorial'}
                  </small>
                </div>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={onToggleTheme}
                  aria-label="Cambiar entre modo claro y oscuro"
                >
                  {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                  <span>{themeMode === 'dark' ? 'Claro' : 'Oscuro'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Instalar App nativa */}
          <div className="sheet-section">
            {isInstalled ? (
              <div className="sheet-install-done">
                <Check size={16} />
                <span>App instalada en tu dispositivo</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={handleInstallClick}
                >
                  <Download size={17} />
                  <span>
                    {canPromptInstall
                      ? 'Instalar Yole Shop como App'
                      : 'Instalar App en tu teléfono / PC'}
                  </span>
                </button>
                {showManualInstall && (
                  <div className="sheet-install-guide">
                    <Smartphone size={16} />
                    <div>
                      <strong>Instalación nativa rápida:</strong>
                      <p>
                        En <b>Android / Chrome / Edge</b>: abre el menú (⋮) del navegador y elige{' '}
                        <b>&quot;Instalar aplicación&quot;</b>. En <b>iPhone (Safari)</b>: toca{' '}
                        <b>Compartir</b> y luego <b>&quot;Añadir a pantalla de inicio&quot;</b>.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* WhatsApp y Admin */}
          <div className="sheet-footer-actions">
            <a
              href={directWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--whatsapp"
              onClick={onClose}
            >
              <MessageCircle size={17} />
              <span>WhatsApp</span>
            </a>
            <button
              type="button"
              className="btn btn--outline-dark"
              onClick={() => {
                onClose();
                onOpenAdmin();
              }}
            >
              <Lock size={16} />
              <span>Administrar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
