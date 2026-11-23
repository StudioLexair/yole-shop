import { useEffect, useState } from 'react';
import { MessageCircle, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type {
  CartItem,
  DeliveryType,
  PaymentMethod,
  StoreSettings,
} from '../types';
import {
  buildWhatsAppOrderLink,
  formatCup,
  formatUsd,
  getDisplayPrice,
  summarizeCart,
} from '../lib/pricing';
import {
  clearCustomerProfile,
  readCustomerProfile,
  submitPublicOrder,
  writeCustomerProfile,
} from '../lib/catalog';
import { SmartImage } from './SmartImage';

interface CartDrawerProps {
  open: boolean;
  items: CartItem[];
  settings: StoreSettings;
  onClose: () => void;
  onUpdateQty: (sku: string, size: string, delta: number) => void;
  onRemove: (sku: string, size: string) => void;
  onClear: () => void;
}

export function CartDrawer({
  open,
  items,
  settings,
  onClose,
  onUpdateQty,
  onRemove,
  onClear,
}: CartDrawerProps) {
  const savedProfile = readCustomerProfile();
  const [customerName, setCustomerName] = useState(savedProfile?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(savedProfile?.customerPhone || '');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(
    savedProfile?.deliveryType || 'domicilio'
  );
  const [deliveryAddress, setDeliveryAddress] = useState(savedProfile?.deliveryAddress || '');
  const [deliveryTime, setDeliveryTime] = useState(savedProfile?.deliveryTime || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    savedProfile?.paymentMethod || 'efectivo'
  );
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sentCode, setSentCode] = useState('');

  useEffect(() => {
    if (
      customerName.trim() ||
      customerPhone.trim() ||
      deliveryAddress.trim() ||
      deliveryTime.trim()
    ) {
      writeCustomerProfile({
        customerName,
        customerPhone,
        deliveryType,
        deliveryAddress,
        paymentMethod,
        deliveryTime,
      });
    }
  }, [customerName, customerPhone, deliveryType, deliveryAddress, paymentMethod, deliveryTime]);

  if (!open) return null;

  const summary = summarizeCart(items, settings, deliveryType, paymentMethod);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (items.length === 0) return;
    if (customerName.trim().length < 2) {
      setErrorMsg('Escribe tu nombre para coordinar el pedido.');
      return;
    }
    if (deliveryType === 'domicilio' && deliveryAddress.trim().length < 4) {
      setErrorMsg('Indica tu dirección o reparto para el domicilio.');
      return;
    }

    const orderCode = `YOL-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const waUrl = buildWhatsAppOrderLink({
      orderCode,
      customerName,
      customerPhone,
      deliveryType,
      deliveryAddress,
      paymentMethod,
      deliveryTime,
      notes,
      items,
      summary,
      settings,
    });

    const savedNotes = [
      deliveryTime.trim() ? `Hora: ${deliveryTime.trim()}` : '',
      notes.trim(),
    ]
      .filter(Boolean)
      .join(' · ');

    setSending(true);
    try {
      await submitPublicOrder({
        order_code: orderCode,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        delivery_type: deliveryType,
        delivery_address: deliveryAddress.trim(),
        payment_method: paymentMethod,
        items: items.map((it) => ({
          sku: it.product.sku,
          title: it.product.title,
          size: it.size,
          qty: it.qty,
          currency: it.product.currency,
          unit_price: it.product.price,
          image_url: it.product.image_url,
        })),
        subtotal_cup: summary.subtotalCup,
        subtotal_usd: summary.subtotalUsd,
        delivery_fee_cup: summary.deliveryFeeCup,
        has_unpriced_items: summary.hasUnpricedItems,
        notes: savedNotes,
      });
    } catch {
      // No bloqueamos el pedido por WhatsApp si hay intermitencia de red
    } finally {
      setSending(false);
    }

    setSentCode(orderCode);
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Carrito de compra" onClick={onClose}>
      <aside className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div className="drawer-title">
            <ShoppingBag size={20} />
            <h2>Tu Pedido ({summary.totalUnits})</h2>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Cerrar carrito">
            <X size={20} />
          </button>
        </header>

        <div className="drawer-body">
          {items.length === 0 ? (
            <div className="drawer-empty">
              <ShoppingBag size={42} strokeWidth={1.4} />
              <p>Tu carrito está vacío.</p>
              <span>Agrega tenis, ropa Shein o accesorios para enviar tu pedido directo por WhatsApp.</span>
            </div>
          ) : (
            <>
              <div className="cart-list">
                {items.map((it) => {
                  const pInfo = getDisplayPrice(
                    it.product,
                    it.product.currency,
                    settings.usd_to_cup_rate
                  );
                  return (
                    <div key={`${it.product.sku}-${it.size}`} className="cart-item">
                      <SmartImage
                        src={it.product.image_url}
                        alt={it.product.title}
                        variant="compact"
                        wrapperClassName="cart-item__thumb"
                      />
                      <div className="cart-item__info">
                        <div className="cart-item__sku">{it.product.sku} · Talla {it.size}</div>
                        <div className="cart-item__title">{it.product.title}</div>
                        <div className="cart-item__price">{pInfo.primary}</div>
                        <div className="cart-item__controls">
                          <button
                            type="button"
                            aria-label="Quitar uno"
                            onClick={() => onUpdateQty(it.product.sku, it.size, -1)}
                          >
                            <Minus size={14} />
                          </button>
                          <span>{it.qty}</span>
                          <button
                            type="button"
                            aria-label="Sumar uno"
                            onClick={() => onUpdateQty(it.product.sku, it.size, 1)}
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            type="button"
                            className="cart-item__del"
                            aria-label="Eliminar artículo"
                            onClick={() => onRemove(it.product.sku, it.size)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form id="yole-checkout-form" className="checkout-form" onSubmit={handleCheckout}>
                <div className="checkout-summary">
                  {summary.subtotalCup > 0 && (
                    <div className="sum-row">
                      <span>Subtotal ({formatUsd(summary.subtotalUsd)})</span>
                      <strong>{formatCup(summary.subtotalCup)}</strong>
                    </div>
                  )}
                  {summary.deliveryFeeCup > 0 && (
                    <div className="sum-row">
                      <span>Domicilio base ({settings.location_text.split('·')[0].trim()})</span>
                      <span>{formatCup(summary.deliveryFeeCup)}</span>
                    </div>
                  )}
                  {summary.transferFeeCup > 0 && (
                    <div className="sum-row">
                      <span>Transferencia (+{settings.transfer_surcharge_pct}%)</span>
                      <span>{formatCup(summary.transferFeeCup)}</span>
                    </div>
                  )}
                  {summary.totalCupWithExtras > 0 && (
                    <div className="sum-row sum-row--total">
                      <span>Total estimado</span>
                      <strong>{formatCup(summary.totalCupWithExtras)}</strong>
                    </div>
                  )}
                  {summary.hasUnpricedItems && (
                    <p className="sum-note">
                      Incluye artículos con precio por confirmar directamente en WhatsApp.
                    </p>
                  )}
                </div>

                {(customerName || customerPhone || deliveryAddress || deliveryTime) && (
                  <div className="checkout-saved-row">
                    <span>Tus datos quedan guardados para próximos pedidos</span>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        clearCustomerProfile();
                        setCustomerName('');
                        setCustomerPhone('');
                        setDeliveryAddress('');
                        setDeliveryTime('');
                      }}
                    >
                      Borrar datos
                    </button>
                  </div>
                )}

                <label className="field">
                  <span>Tu nombre *</span>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Laura Pérez"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Teléfono / WhatsApp</span>
                  <input
                    type="tel"
                    placeholder="Ej. +53 5..."
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </label>

                <div className="field">
                  <span>Entrega</span>
                  <div className="seg-group">
                    <button
                      type="button"
                      className={deliveryType === 'domicilio' ? 'is-active' : ''}
                      onClick={() => setDeliveryType('domicilio')}
                    >
                      A domicilio ({formatCup(settings.delivery_fee_cup)})
                    </button>
                    <button
                      type="button"
                      className={deliveryType === 'recogida' ? 'is-active' : ''}
                      onClick={() => setDeliveryType('recogida')}
                    >
                      Recoger
                    </button>
                  </div>
                </div>

                {deliveryType === 'domicilio' && (
                  <label className="field">
                    <span>Dirección / Reparto *</span>
                    <input
                      type="text"
                      required
                      placeholder="Calle, entre calles y reparto"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                    />
                  </label>
                )}

                <div className="field">
                  <span>Forma de pago</span>
                  <div className="seg-group seg-group--3">
                    <button
                      type="button"
                      className={paymentMethod === 'efectivo' ? 'is-active' : ''}
                      onClick={() => setPaymentMethod('efectivo')}
                    >
                      Efectivo CUP
                    </button>
                    <button
                      type="button"
                      className={paymentMethod === 'usd' ? 'is-active' : ''}
                      onClick={() => setPaymentMethod('usd')}
                    >
                      Efectivo USD
                    </button>
                    <button
                      type="button"
                      className={paymentMethod === 'transferencia' ? 'is-active' : ''}
                      onClick={() => setPaymentMethod('transferencia')}
                    >
                      Transf. (+{settings.transfer_surcharge_pct}%)
                    </button>
                  </div>
                </div>

                <label className="field">
                  <span>Hora de entrega preferida (opcional)</span>
                  <input
                    type="text"
                    placeholder="Ej. Hoy en la tarde, después de las 3pm..."
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Nota adicional (opcional)</span>
                  <input
                    type="text"
                    placeholder="Horario preferido, color alternativo..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>

                {errorMsg && <p className="form-error">{errorMsg}</p>}

                {sentCode && (
                  <div className="form-ok">
                    Pedido <strong>{sentCode}</strong> guardado y abierto en WhatsApp.
                    <button type="button" className="btn-link" onClick={onClear}>
                      Vaciar carrito
                    </button>
                  </div>
                )}
              </form>
            </>
          )}
        </div>

        {items.length > 0 && (
          <footer className="drawer-footer">
            {summary.totalCupWithExtras > 0 && (
              <div className="drawer-footer__total">
                <span>Total estimado</span>
                <strong>{formatCup(summary.totalCupWithExtras)}</strong>
              </div>
            )}
            <button
              type="submit"
              form="yole-checkout-form"
              className="btn btn--whatsapp btn--block drawer-footer__cta"
              disabled={sending}
            >
              <MessageCircle size={18} />
              <span>{sending ? 'Preparando pedido...' : 'Enviar pedido a WhatsApp'}</span>
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}
