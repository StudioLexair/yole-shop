import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  FileDown,
  MessageCircle,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CartItem,
  Coupon,
  Currency,
  DeliveryType,
  PaymentChannelKey,
  PaymentMethod,
  Product,
  ResellerConfig,
  StoreSettings,
} from '../types';
import {
  buildWhatsAppOrderLink,
  cartHasTransferBlockedItems,
  cartTransferBlockReason,
  formatCup,
  formatUsd,
  isCupLockedFootwear,
  summarizeCart,
} from '../lib/pricing';
import {
  clearCustomerProfile,
  readCustomerProfile,
  recordCouponUse,
  submitPublicOrder,
  validateCouponCode,
  writeCustomerProfile,
} from '../lib/catalog';
import { getCrossSellSuggestions } from '../lib/assistantEngine';
import {
  calculateShippingEstimate,
  downloadFormalQuotePdf,
  formatChannelTotal,
  getClientFacingPrice,
  PAYMENT_CHANNEL_ORDER,
  SHIPPING_ZONES,
} from '../lib/commerceTools';
import { QrCodeSvg } from './QrCodeSvg';
import { SmartImage } from './SmartImage';

interface CartDrawerProps {
  open: boolean;
  items: CartItem[];
  allProducts?: Product[];
  displayCurrency?: Currency;
  settings: StoreSettings;
  reseller?: ResellerConfig;
  referralCode?: string;
  activeCoupon?: Coupon | null;
  onApplyCoupon?: (coupon: Coupon | null) => void;
  onOpenTracker?: (code: string) => void;
  onQuickAddProduct?: (product: Product, size: string) => void;
  onClose: () => void;
  onUpdateQty: (sku: string, size: string, delta: number) => void;
  onRemove: (sku: string, size: string) => void;
  onClear: () => void;
}

export function CartDrawer({
  open,
  items,
  allProducts = [],
  displayCurrency = 'USD',
  settings,
  reseller,
  referralCode = '',
  activeCoupon = null,
  onApplyCoupon,
  onOpenTracker,
  onQuickAddProduct,
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
  const [couponInput, setCouponInput] = useState(activeCoupon?.code || '');
  const [couponMsg, setCouponMsg] = useState('');
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sentCode, setSentCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [shippingZoneId, setShippingZoneId] = useState('santa-clara');
  const [paymentChannel, setPaymentChannel] = useState<PaymentChannelKey>('efectivo_usd');
  const [quoteBusy, setQuoteBusy] = useState(false);

  const shippingEst = useMemo(
    () => calculateShippingEstimate(shippingZoneId, items, deliveryType),
    [shippingZoneId, items, deliveryType]
  );

  const crossSellPool = useMemo(() => {
    if (items.length === 0 || allProducts.length === 0) return [];
    const inCartSkus = new Set(items.map((it) => it.product.sku));
    return getCrossSellSuggestions(items[0].product, allProducts)
      .filter((p) => !inCartSkus.has(p.sku))
      .slice(0, 3);
  }, [items, allProducts]);

  const transferBlocked = cartHasTransferBlockedItems(items);
  const transferBlockMsg = cartTransferBlockReason(items);
  const effectivePaymentMethod: PaymentMethod =
    transferBlocked && paymentMethod === 'transferencia' ? 'efectivo' : paymentMethod;

  useEffect(() => {
    if (transferBlocked && paymentMethod === 'transferencia') {
      setPaymentMethod('efectivo');
    }
  }, [transferBlocked, paymentMethod]);

  useEffect(() => {
    if (activeCoupon?.code) {
      setCouponInput(activeCoupon.code);
      setCouponMsg('');
    }
  }, [activeCoupon?.code]);

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
        paymentMethod: effectivePaymentMethod,
        deliveryTime,
      });
    }
  }, [
    customerName,
    customerPhone,
    deliveryType,
    deliveryAddress,
    effectivePaymentMethod,
    deliveryTime,
  ]);

  if (!open) return null;

  const summary = summarizeCart(items, settings, deliveryType, effectivePaymentMethod, activeCoupon);

  const handleApplyCoupon = async () => {
    const clean = couponInput.trim().toUpperCase();
    if (!clean) {
      setCouponMsg('Escribe un código VIP o cupón.');
      return;
    }
    setCheckingCoupon(true);
    setCouponMsg('');
    try {
      const res = await validateCouponCode(clean);
      if (!res.valid || !res.coupon) {
        setCouponMsg(res.reason || 'Cupón no válido.');
        return;
      }
      onApplyCoupon?.(res.coupon);
      setCouponMsg('');
    } finally {
      setCheckingCoupon(false);
    }
  };

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

    const orderCode = `YOL-ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const appliedCode = summary.discountCup > 0 && activeCoupon ? activeCoupon.code : '';
    const extraMetaParts = [
      `Canal: ${channelTotal.channelLabel} (${channelTotal.formatted})`,
      `Zona: ${shippingEst.label}`,
      referralCode ? `Ref: ${referralCode}` : '',
    ].filter(Boolean);
    const enrichedNotes = [notes.trim(), ...extraMetaParts].filter(Boolean).join(' · ');

    const waUrl = buildWhatsAppOrderLink({
      orderCode,
      customerName,
      customerPhone,
      deliveryType,
      deliveryAddress,
      paymentMethod: effectivePaymentMethod,
      deliveryTime,
      notes: enrichedNotes,
      items,
      summary,
      discountCode: appliedCode || undefined,
      settings,
    });

    const savedNotes = [
      deliveryTime.trim() ? `Hora: ${deliveryTime.trim()}` : '',
      enrichedNotes,
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
        payment_method: effectivePaymentMethod,
        items: items.map((it) => ({
          sku: it.product.sku,
          title: it.product.title,
          size: it.size,
          qty: it.qty,
          currency: it.product.currency,
          unit_price: it.product.price,
          image_url: it.product.image_url,
        })),
        subtotal_cup: summary.discountedSubtotalCup,
        subtotal_usd: summary.discountedSubtotalUsd,
        delivery_fee_cup: summary.deliveryFeeCup,
        discount_code: appliedCode,
        discount_cup: summary.discountCup,
        discount_usd: summary.discountUsd,
        has_unpriced_items: summary.hasUnpricedItems,
        notes: savedNotes,
        referral_code: referralCode || '',
        payment_channel: paymentChannel,
        shipping_zone: shippingZoneId,
      });
      if (appliedCode) {
        await recordCouponUse(appliedCode);
      }
    } catch {
      // No bloqueamos el pedido por WhatsApp si hay intermitencia de red
    } finally {
      setSending(false);
    }

    setSentCode(orderCode);
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const trackUrl = sentCode
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://yoleshop.ddns.net'}/?track=${encodeURIComponent(sentCode)}`
    : '';

  const rate = settings.usd_to_cup_rate > 0 ? settings.usd_to_cup_rate : 980;
  const allCupFootwear =
    items.length > 0 && items.every((it) => isCupLockedFootwear(it.product));
  const summaryInUsd = displayCurrency === 'USD' && !allCupFootwear;
  const deliveryFeeUsd = Math.round((summary.deliveryFeeCup / rate) * 100) / 100;
  const transferFeeUsd = Math.round((summary.transferFeeCup / rate) * 100) / 100;
  const totalUsdWithExtras = Math.round((summary.totalCupWithExtras / rate) * 100) / 100;
  const totalUsdWithZone = totalUsdWithExtras;
  const channelTotal = formatChannelTotal(totalUsdWithZone, paymentChannel, settings);

  const handleDownloadCartPdf = async () => {
    if (items.length === 0 || quoteBusy) return;
    setQuoteBusy(true);
    try {
      await downloadFormalQuotePdf({
        items: items.map((it) => ({
          product: it.product,
          size: it.size,
          qty: it.qty,
        })),
        settings,
        reseller,
        shippingLabel: shippingEst.label,
        shippingFeeUsd: 0,
        customerName: customerName.trim() || undefined,
        referralCode: referralCode || undefined,
      });
    } finally {
      setQuoteBusy(false);
    }
  };

  return (
    <div
      className="drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Carrito de compra"
      onClick={onClose}
    >
      <aside className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div className="drawer-title">
            <ShoppingBag size={20} />
            <h2>Tu Pedido ({summary.totalUnits})</h2>
          </div>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="Cerrar carrito"
          >
            <X size={20} />
          </button>
        </header>

        <div className="drawer-body">
          {items.length === 0 ? (
            <div className="drawer-empty">
              <ShoppingBag size={42} strokeWidth={1.4} />
              <p>Tu carrito está vacío.</p>
              <span>
                Agrega tenis, ropa Shein o accesorios para enviar tu pedido directo por WhatsApp.
              </span>
            </div>
          ) : (
            <>
              <div className="cart-list">
                {items.map((it) => {
                  const pInfo = getClientFacingPrice(
                    it.product,
                    displayCurrency,
                    settings.usd_to_cup_rate,
                    reseller
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
                        <div className="cart-item__sku">
                          {it.product.sku} · Talla {it.size}
                        </div>
                        <div className="cart-item__title">{it.product.title}</div>
                        <div className="cart-item__price">{pInfo.formatted}</div>
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

              {crossSellPool.length > 0 && onQuickAddProduct && (
                <div className="cart-cross-sell">
                  <span className="cart-cross-sell__head">Completa tu pedido</span>
                  <div className="cart-cross-sell__list">
                    {crossSellPool.map((p) => {
                      const pr = getClientFacingPrice(
                        p,
                        displayCurrency,
                        settings.usd_to_cup_rate,
                        reseller
                      );
                      return (
                        <div key={p.id} className="cart-cross-sell__row">
                          <SmartImage
                            src={p.image_url}
                            alt={p.title}
                            variant="compact"
                            wrapperClassName="cart-cross-sell__img"
                          />
                          <div>
                            <strong>{p.title}</strong>
                            <small>{pr.formatted}</small>
                          </div>
                          <button
                            type="button"
                            className="btn-ghost-sm"
                            onClick={() => onQuickAddProduct(p, p.sizes[0] || 'Única')}
                          >
                            + Sumar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cupón o enlace VIP */}
              <div className="coupon-box">
                <div className="coupon-box__head">
                  <Tag size={14} />
                  <span>¿Tienes cupón o código VIP?</span>
                </div>
                {activeCoupon ? (
                  <div className="coupon-active-pill">
                    <span>
                      <strong>{activeCoupon.code}</strong> ·{' '}
                      {activeCoupon.vip_label ||
                        (activeCoupon.discount_type === 'percent'
                          ? `-${activeCoupon.discount_value}%`
                          : activeCoupon.discount_type === 'fixed_usd'
                            ? `-$${activeCoupon.discount_value} USD`
                            : `-${formatCup(activeCoupon.discount_value)}`)}
                    </span>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        onApplyCoupon?.(null);
                        setCouponInput('');
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <div className="coupon-input-row">
                    <input
                      type="text"
                      placeholder="Ej. YOLE10"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      aria-label="Código de cupón"
                    />
                    <button
                      type="button"
                      className="btn btn--outline-dark btn--sm"
                      disabled={checkingCoupon}
                      onClick={() => void handleApplyCoupon()}
                    >
                      {checkingCoupon ? '...' : 'Aplicar'}
                    </button>
                  </div>
                )}
                {couponMsg && <p className="coupon-err">{couponMsg}</p>}
              </div>

              <form id="yole-checkout-form" className="checkout-form" onSubmit={handleCheckout}>
                <div className="checkout-summary">
                  {summary.subtotalCup > 0 && (
                    <div className="sum-row">
                      <span>
                        Subtotal (
                        {summaryInUsd
                          ? formatCup(summary.subtotalCup)
                          : formatUsd(summary.subtotalUsd)}
                        )
                      </span>
                      <strong>
                        {summaryInUsd
                          ? formatUsd(summary.subtotalUsd)
                          : formatCup(summary.subtotalCup)}
                      </strong>
                    </div>
                  )}
                  {summary.discountCup > 0 && activeCoupon && (
                    <div className="sum-row sum-row--discount">
                      <span>Descuento {activeCoupon.code}</span>
                      <strong>
                        -
                        {summaryInUsd
                          ? formatUsd(summary.discountUsd)
                          : formatCup(summary.discountCup)}
                      </strong>
                    </div>
                  )}
                  {deliveryType === 'domicilio' && (
                    <div className="sum-row">
                      <span>Domicilio base (puede costar más según tienda/zona)</span>
                      <span>
                        {summary.deliveryFeeCup > 0
                          ? `Desde ${summaryInUsd ? formatUsd(deliveryFeeUsd) : formatCup(summary.deliveryFeeCup)} · a consultar`
                          : 'A consultar'}
                      </span>
                    </div>
                  )}
                  {summary.transferFeeCup > 0 && (
                    <div className="sum-row">
                      <span>Transferencia (+{settings.transfer_surcharge_pct}%)</span>
                      <span>
                        {summaryInUsd
                          ? formatUsd(transferFeeUsd)
                          : formatCup(summary.transferFeeCup)}
                      </span>
                    </div>
                  )}
                  {summary.totalCupWithExtras > 0 && (
                    <div className="sum-row sum-row--total">
                      <span>
                        Total estimado (
                        {summaryInUsd
                          ? formatCup(summary.totalCupWithExtras)
                          : formatUsd(totalUsdWithExtras)}
                        )
                      </span>
                      <strong>
                        {summaryInUsd
                          ? formatUsd(totalUsdWithExtras)
                          : formatCup(summary.totalCupWithExtras)}
                      </strong>
                    </div>
                  )}
                  {deliveryType === 'domicilio' && (
                    <p className="sum-note">
                      El envío mostrado es solo un <strong>precio base orientativo</strong>: cada
                      tienda usa mensajería distinta y el costo final puede ser mayor según tu
                      reparto en Santa Clara o municipio exterior (confirmado antes de salir).
                    </p>
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
                      {settings.delivery_fee_cup > 0
                        ? `A domicilio (base ${formatCup(settings.delivery_fee_cup)} · a consultar)`
                        : 'A domicilio (A consultar)'}
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
                  <>
                    <label className="field">
                      <span>Zona / Municipio de entrega (Precio base orientativo)</span>
                      <select
                        value={shippingZoneId}
                        onChange={(e) => setShippingZoneId(e.target.value)}
                      >
                        {SHIPPING_ZONES.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.label}
                          </option>
                        ))}
                      </select>
                      <small className="field-hint">
                        {shippingEst.label} · Puede variar según tienda de origen y reparto exacto.
                      </small>
                    </label>
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
                  </>
                )}

                <div className="field">
                  <span>Moneda / Canal de pago en tiempo real</span>
                  <div className="channel-pills">
                    {PAYMENT_CHANNEL_ORDER.map((chKey) => {
                      const info = formatChannelTotal(totalUsdWithZone, chKey, settings);
                      return (
                        <button
                          key={chKey}
                          type="button"
                          className={`channel-pill ${paymentChannel === chKey ? 'is-active' : ''}`}
                          onClick={() => {
                            setPaymentChannel(chKey);
                            if (chKey === 'cup') setPaymentMethod('efectivo');
                            else setPaymentMethod('usd');
                          }}
                        >
                          <span>{info.channelLabel}</span>
                          <strong>{info.formatted}</strong>
                        </button>
                      );
                    })}
                  </div>
                  <small className="field-hint">
                    {channelTotal.channelLabel}: {channelTotal.formatted} ({channelTotal.note})
                    {referralCode ? ` · Referido por ${referralCode}` : ''}
                  </small>
                </div>

                <div className="field">
                  <span>Forma de pago</span>
                  <div className="seg-group seg-group--3">
                    <button
                      type="button"
                      className={effectivePaymentMethod === 'efectivo' ? 'is-active' : ''}
                      onClick={() => setPaymentMethod('efectivo')}
                    >
                      Efectivo CUP
                    </button>
                    <button
                      type="button"
                      className={effectivePaymentMethod === 'usd' ? 'is-active' : ''}
                      onClick={() => setPaymentMethod('usd')}
                    >
                      Efectivo USD
                    </button>
                    <button
                      type="button"
                      disabled={transferBlocked}
                      title={transferBlockMsg || undefined}
                      className={effectivePaymentMethod === 'transferencia' ? 'is-active' : ''}
                      onClick={() => !transferBlocked && setPaymentMethod('transferencia')}
                    >
                      Transf. (+{settings.transfer_surcharge_pct}%)
                    </button>
                  </div>
                  {transferBlockMsg && (
                    <p className="shein-cash-only-note" role="note">
                      {transferBlockMsg}
                    </p>
                  )}
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
                  <div className="order-qr-confirm">
                    <div className="order-qr-confirm__info">
                      <strong>Pedido {sentCode} guardado</strong>
                      <p>Guarda o escanea este código QR para seguir el estado de tu paquete.</p>
                      <div className="order-qr-confirm__btns">
                        <button
                          type="button"
                          className="btn btn--outline-dark btn--sm"
                          onClick={() => {
                            void navigator.clipboard?.writeText(sentCode);
                            setCopiedCode(true);
                            setTimeout(() => setCopiedCode(false), 1800);
                          }}
                        >
                          {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedCode ? 'Copiado' : 'Copiar código'}</span>
                        </button>
                        {onOpenTracker && (
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            onClick={() => {
                              onClose();
                              onOpenTracker(sentCode);
                            }}
                          >
                            <Package size={13} />
                            <span>Ver seguimiento</span>
                          </button>
                        )}
                        <button type="button" className="btn-link" onClick={onClear}>
                          Vaciar carrito
                        </button>
                      </div>
                    </div>
                    <div className="order-qr-confirm__qr">
                      <QrCodeSvg value={trackUrl} size={88} />
                    </div>
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
                <span>
                  {channelTotal.channelLabel} ({channelTotal.note})
                </span>
                <strong>{channelTotal.formatted}</strong>
              </div>
            )}
            <div className="drawer-footer__btn-row">
              <button
                type="button"
                className="btn btn--outline-dark btn--sm"
                disabled={quoteBusy}
                onClick={() => void handleDownloadCartPdf()}
                title="Descargar cotización formal en PDF"
              >
                <FileDown size={16} />
                <span>{quoteBusy ? 'PDF...' : 'Cotizar PDF'}</span>
              </button>
              <button
                type="submit"
                form="yole-checkout-form"
                className="btn btn--whatsapp btn--block drawer-footer__cta"
                disabled={sending}
              >
                <MessageCircle size={18} />
                <span>{sending ? 'Preparando pedido...' : 'Enviar pedido a WhatsApp'}</span>
              </button>
            </div>
          </footer>
        )}
      </aside>
    </div>
  );
}
