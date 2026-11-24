import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  MessageCircle,
  Package,
  Search,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import type { OrderStatus, PublicOrderTracking, StoreSettings } from '../types';
import { fetchOrderTracking } from '../lib/catalog';
import { buildWhatsAppUrl, formatCup, formatUsd, normalizeWhatsAppDigits } from '../lib/pricing';
import { QrCodeSvg } from './QrCodeSvg';

interface OrderTrackerModalProps {
  open: boolean;
  initialCode?: string;
  settings: StoreSettings;
  onClose: () => void;
}

const STEPS: Array<{ key: OrderStatus; label: string; desc: string }> = [
  { key: 'nuevo', label: 'Pendiente', desc: 'Pedido recibido' },
  { key: 'confirmado', label: 'Confirmado', desc: 'Listando mercancía' },
  { key: 'en_reparto', label: 'En reparto', desc: 'Mensajero en camino' },
  { key: 'entregado', label: 'Entregado', desc: '¡Disfruta tu compra!' },
];

function stepIndex(status: OrderStatus): number {
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

export function OrderTrackerModal({
  open,
  initialCode = '',
  settings,
  onClose,
}: OrderTrackerModalProps) {
  const [codeInput, setCodeInput] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [tracking, setTracking] = useState<PublicOrderTracking | null>(null);

  const runLookup = async (code: string) => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 3) {
      setErrorMsg('Escribe un código válido (ej. YOL-ORD-1042 o YOL-ABCD).');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchOrderTracking(clean);
      if (!res) {
        setTracking(null);
        setErrorMsg(`No encontramos ningún pedido con el código "${clean}".`);
      } else {
        setTracking(res);
      }
    } catch {
      setErrorMsg('No se pudo consultar el estado en este momento. Intenta en unos segundos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && initialCode.trim()) {
      setCodeInput(initialCode.trim().toUpperCase());
      void runLookup(initialCode);
    }
  }, [open, initialCode]);

  if (!open) return null;

  const activeIdx = tracking ? stepIndex(tracking.status) : 0;
  const isCanceled = tracking?.status === 'cancelado';
  const trackUrl = tracking
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://yoleshop.ddns.net'}/?track=${encodeURIComponent(tracking.order_code)}`
    : '';
  const waSupportUrl = tracking
    ? buildWhatsAppUrl(
        normalizeWhatsAppDigits(settings.whatsapp_number),
        `Hola Yole Shop, consulto por mi pedido ${tracking.order_code}.`
      )
    : '';

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Seguimiento de pedido"
      onClick={onClose}
    >
      <div className="modal-card modal-card--narrow" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar seguimiento"
        >
          <X size={20} />
        </button>

        <div className="tracker-head">
          <div className="tracker-icon">
            <Package size={22} />
          </div>
          <div>
            <h2>Seguimiento de pedido</h2>
            <p>Consulta en tiempo real el estado de tu compra con tu código.</p>
          </div>
        </div>

        <form
          className="tracker-search-form"
          onSubmit={(e) => {
            e.preventDefault();
            void runLookup(codeInput);
          }}
        >
          <input
            type="text"
            placeholder="Ej. YOL-ORD-1042"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            aria-label="Código de pedido"
          />
          <button type="submit" className="btn btn--primary" disabled={loading}>
            <Search size={16} />
            <span>{loading ? 'Buscando...' : 'Consultar'}</span>
          </button>
        </form>

        {errorMsg && <p className="form-error">{errorMsg}</p>}

        {tracking && (
          <div className="tracker-result">
            <div className="tracker-top-row">
              <div>
                <span className="tracker-code-label">Código de orden</span>
                <strong className="tracker-code">{tracking.order_code}</strong>
                {tracking.customer_first_name && (
                  <span className="tracker-client">Cliente: {tracking.customer_first_name}</span>
                )}
              </div>
              <div className="tracker-qr-box">
                <QrCodeSvg value={trackUrl} size={86} />
              </div>
            </div>

            {isCanceled ? (
              <div className="tracker-canceled">
                <XCircle size={20} />
                <span>Este pedido figura como cancelado. Escríbenos por WhatsApp si deseas reactivarlo.</span>
              </div>
            ) : (
              <div className="tracker-steps" aria-label="Progreso del pedido">
                {STEPS.map((st, idx) => {
                  const done = idx <= activeIdx;
                  const current = idx === activeIdx;
                  return (
                    <div
                      key={st.key}
                      className={`tracker-step${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}
                    >
                      <span className="tracker-step__dot">
                        {st.key === 'en_reparto' ? (
                          <Truck size={14} />
                        ) : st.key === 'entregado' ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <Clock size={14} />
                        )}
                      </span>
                      <div className="tracker-step__txt">
                        <strong>{st.label}</strong>
                        <span>{st.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="tracker-items">
              <strong>Artículos ({tracking.items.length})</strong>
              <ul>
                {tracking.items.map((it, idx) => (
                  <li key={`${it.sku}-${idx}`}>
                    <span>
                      {it.qty}x {it.title} ({it.size || 'Única'})
                    </span>
                    <small>{it.sku}</small>
                  </li>
                ))}
              </ul>
            </div>

            <div className="tracker-totals">
              {tracking.discount_code && Number(tracking.discount_cup) > 0 && (
                <div>
                  <span>Cupón {tracking.discount_code}</span>
                  <strong>-{formatCup(Number(tracking.discount_cup))}</strong>
                </div>
              )}
              {tracking.subtotal_cup > 0 && (
                <div>
                  <span>Subtotal ({formatUsd(tracking.subtotal_usd)})</span>
                  <strong>{formatCup(tracking.subtotal_cup)}</strong>
                </div>
              )}
            </div>

            <a
              href={waSupportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--whatsapp btn--block"
            >
              <MessageCircle size={17} />
              <span>Consultar pedido por WhatsApp</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
