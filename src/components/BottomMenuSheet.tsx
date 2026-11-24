import { useState } from 'react';
import {
  BellRing,
  Briefcase,
  Check,
  ChevronRight,
  Download,
  Heart,
  MapPin,
  MessageCircle,
  Moon,
  Package,
  Smartphone,
  Sparkles,
  Sun,
  Truck,
  X,
} from 'lucide-react';
import type { Currency, Department, StoreSettings } from '../types';
import type { SheinSubFilter, ThemeMode } from '../lib/catalog';
import { subscribeStoreAlerts } from '../lib/catalog';
import {
  markAlertSubscribedLocal,
  readAlertSubscribed,
  triggerBrowserDropNotification,
} from '../lib/commerceTools';
import { formatCup } from '../lib/pricing';

interface BottomMenuSheetProps {
  open: boolean;
  onClose: () => void;
  settings: StoreSettings;
  department: Department | 'all';
  sheinGender: SheinSubFilter;
  deptCounts: {
    all: number;
    calzado: number;
    calzadoTenis: number;
    calzadoShein: number;
    moda_shein: number;
    hombre: number;
    accesorios: number;
    movilidad: number;
    solares: number;
  };
  displayCurrency: Currency;
  themeMode?: ThemeMode;
  onToggleTheme?: () => void;
  favoriteCount?: number;
  onlyFavorites?: boolean;
  onToggleFavorites?: () => void;
  onSelectDept: (dep: Department | 'all') => void;
  onSelectSheinGender: (g: SheinSubFilter) => void;
  onChangeCurrency: (c: Currency) => void;
  onOpenTracker: () => void;
  onOpenAssistant?: (tab?: 'chat' | 'solar' | 'compare' | 'kit') => void;
  onOpenGestorPortal?: () => void;
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
  onOpenTracker,
  onOpenAssistant,
  onOpenGestorPortal,
  directWaUrl,
  canPromptInstall,
  isInstalled,
  onInstallApp,
}: BottomMenuSheetProps) {
  const [showManualInstall, setShowManualInstall] = useState(false);
  const [alertSubscribed, setAlertSubscribed] = useState(() => readAlertSubscribed());
  const [alertContact, setAlertContact] = useState('');
  const [alertSaving, setAlertSaving] = useState(false);

  const handleEnableAlerts = async () => {
    if (alertSaving) return;
    setAlertSaving(true);
    try {
      let pushGranted = false;
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          pushGranted = true;
        } else if (Notification.permission !== 'denied') {
          const perm = await Notification.requestPermission();
          pushGranted = perm === 'granted';
        }
      }
      await subscribeStoreAlerts({
        contact: alertContact || 'web-push',
        topics: ['drops', 'ofertas'],
        department: department === 'all' ? 'all' : department,
        pushSupported: pushGranted,
      }).catch(() => undefined);
      markAlertSubscribedLocal();
      setAlertSubscribed(true);
      if (pushGranted) {
        await triggerBrowserDropNotification(
          'Yole Shop · Alertas Activadas',
          'Te avisaremos cuando entren nuevos drops y rebajas en la tienda.'
        );
      }
    } finally {
      setAlertSaving(false);
    }
  };

  if (!open) return null;

  const pickDept = (dep: Department | 'all') => {
    onSelectDept(dep);
    onClose();
  };

  const pickShein = (g: SheinSubFilter) => {
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
            <span className="brand-monogram brand-monogram--img">
              <img src="/brand-mark.webp" alt="Logo Yole Shop" width={36} height={36} />
            </span>
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
              <Truck size={13} />{' '}
              {settings.delivery_fee_cup > 0
                ? `Domicilio base ${formatCup(settings.delivery_fee_cup)} (a consultar por tienda/zona)`
                : 'Domicilio: A consultar según tienda y zona'}
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
                  {deptCounts.calzadoShein > 0 && (
                    <button
                      type="button"
                      className={`chip${department === 'moda_shein' && sheinGender === 'zuecos' ? ' is-active' : ''}`}
                      onClick={() => pickShein('zuecos')}
                    >
                      Zuecos &amp; Sandalias ({deptCounts.calzadoShein})
                    </button>
                  )}
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

              <button
                type="button"
                className={`sheet-nav-item${department === 'movilidad' ? ' is-active' : ''}`}
                onClick={() => pickDept('movilidad')}
              >
                <span>Motos &amp; Todo Virginia</span>
                <span className="sheet-nav-right">
                  <strong>{deptCounts.movilidad}</strong>
                  <ChevronRight size={16} />
                </span>
              </button>

              <button
                type="button"
                className={`sheet-nav-item${department === 'solares' ? ' is-active' : ''}`}
                onClick={() => pickDept('solares')}
              >
                <span>Equipos Solares</span>
                <span className="sheet-nav-right">
                  <strong>{deptCounts.solares}</strong>
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
                  {displayCurrency === 'USD' ? ' · Tenis en CUP' : ''}
                </small>
              </div>
              <div className="curr-toggle">
                <button
                  type="button"
                  className={displayCurrency === 'USD' ? 'is-active' : ''}
                  onClick={() => onChangeCurrency('USD')}
                >
                  USD
                </button>
                <button
                  type="button"
                  className={displayCurrency === 'CUP' ? 'is-active' : ''}
                  onClick={() => onChangeCurrency('CUP')}
                >
                  CUP
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

          {/* Asistente Yole Pro & Seguir pedido QR */}
          <div className="sheet-section">
            {onOpenAssistant && (
              <button
                type="button"
                className="btn btn--primary btn--block"
                style={{ marginBottom: 8 }}
                onClick={() => {
                  onClose();
                  onOpenAssistant('chat');
                }}
              >
                <Sparkles size={17} />
                <span>Asistente Yole Pro · Calc. Solar · Comparar</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn--outline-dark btn--block"
              onClick={() => {
                onClose();
                onOpenTracker();
              }}
            >
              <Package size={17} />
              <span>Seguir mi pedido (QR / Código)</span>
            </button>
          </div>

          {/* Alertas PWA / Notificaciones de Drops */}
          <div className="sheet-section">
            <span className="sheet-label">Alertas de Drops y Rebajas (PWA)</span>
            {alertSubscribed ? (
              <div className="sheet-install-done">
                <BellRing size={16} />
                <span>Alertas activadas en este dispositivo</span>
              </div>
            ) : (
              <div className="sheet-alert-box">
                <input
                  type="text"
                  placeholder="Tu WhatsApp opcional (para avisarte si hay drop)"
                  value={alertContact}
                  onChange={(e) => setAlertContact(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn--outline-dark btn--block"
                  disabled={alertSaving}
                  onClick={() => void handleEnableAlerts()}
                >
                  <BellRing size={16} />
                  <span>
                    {alertSaving ? 'Activando...' : 'Avísame cuando entren drops o baje de precio'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Programa Gestor PRO (página dedicada con verificación manual) */}
          {onOpenGestorPortal && (
            <div className="sheet-section">
              <button
                type="button"
                className="sheet-gestor-pro-btn"
                onClick={() => {
                  onClose();
                  onOpenGestorPortal();
                }}
              >
                <div className="sheet-gestor-pro-btn__left">
                  <Briefcase size={17} />
                  <div>
                    <strong>
                      Modo Gestor <span className="pro-badge">PRO</span>
                    </strong>
                    <small>¿Quieres vender Yole Shop con tus precios? Solicita cuenta</small>
                  </div>
                </div>
                <ChevronRight size={17} />
              </button>
            </div>
          )}

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

          {/* Contacto directo WhatsApp */}
          <div className="sheet-footer-actions sheet-footer-actions--single">
            <a
              href={directWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--whatsapp btn--block"
              onClick={onClose}
            >
              <MessageCircle size={17} />
              <span>Escribir por WhatsApp</span>
            </a>
          </div>

          <a
            href="https://studiolexair.ddns.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="sheet-studio-credit"
          >
            <span>Tienda hecha por</span>
            <strong>Studio Lexair</strong>
            <span>· studiolexair.ddns.net</span>
          </a>
        </div>
      </div>
    </div>
  );
}
