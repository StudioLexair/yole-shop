import type {
  CartItem,
  Currency,
  DeliveryType,
  PaymentMethod,
  Product,
  StoreSettings,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';

export interface SheinMarkupRules {
  shein_under_20_markup: number;
  shein_even_20_plus_markup: number;
  shein_odd_20_plus_markup: number;
}

/**
 * Regla Yole Shop para ropa / productos en USD:
 * - Si el costo es menor a 20 USD -> +2 USD
 * - Si el costo es 20 USD o más y par -> +2 USD (ej. 28 -> 30)
 * - Si el costo es 20 USD o más e impar -> +3 USD (ej. 25 -> 28)
 */
export function calcYoleSheinPrice(
  costUsd: number,
  rules: SheinMarkupRules = DEFAULT_SETTINGS
): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
  const clean = Math.round(costUsd * 100) / 100;
  if (clean < 20) {
    return Math.round((clean + rules.shein_under_20_markup) * 100) / 100;
  }
  const whole = Math.floor(clean);
  const markup = whole % 2 !== 0 ? rules.shein_odd_20_plus_markup : rules.shein_even_20_plus_markup;
  return Math.round((clean + markup) * 100) / 100;
}

export function formatCup(amount: number): string {
  const rounded = Math.round(amount);
  return `${rounded.toLocaleString('es-ES')} CUP`;
}

export function formatUsd(amount: number): string {
  const isInt = Math.abs(amount - Math.round(amount)) < 0.005;
  return `$${isInt ? Math.round(amount) : amount.toFixed(2)} USD`;
}

export function priceInCup(
  price: number | null,
  currency: Currency,
  usdToCupRate: number
): number | null {
  if (price === null || !Number.isFinite(price)) return null;
  if (currency === 'CUP') return Math.round(price);
  return Math.round(price * (usdToCupRate > 0 ? usdToCupRate : 980));
}

export function priceInUsd(
  price: number | null,
  currency: Currency,
  usdToCupRate: number
): number | null {
  if (price === null || !Number.isFinite(price)) return null;
  if (currency === 'USD') return Math.round(price * 100) / 100;
  const rate = usdToCupRate > 0 ? usdToCupRate : 980;
  return Math.round((price / rate) * 100) / 100;
}

export function getDisplayPrice(
  product: Pick<Product, 'price' | 'currency'>,
  displayCurrency: Currency,
  usdToCupRate: number
): { primary: string; secondary: string | null; isConsult: boolean } {
  if (product.price === null || !Number.isFinite(product.price)) {
    return {
      primary: 'Consultar precio',
      secondary: 'Atención directa por WhatsApp',
      isConsult: true,
    };
  }
  if (displayCurrency === 'CUP') {
    const cup = priceInCup(product.price, product.currency, usdToCupRate)!;
    const usd = priceInUsd(product.price, product.currency, usdToCupRate)!;
    return {
      primary: formatCup(cup),
      secondary: `≈ ${formatUsd(usd)}`,
      isConsult: false,
    };
  }
  const usd = priceInUsd(product.price, product.currency, usdToCupRate)!;
  const cup = priceInCup(product.price, product.currency, usdToCupRate)!;
  return {
    primary: formatUsd(usd),
    secondary: formatCup(cup),
    isConsult: false,
  };
}

export interface CartSummary {
  totalUnits: number;
  subtotalCup: number;
  subtotalUsd: number;
  deliveryFeeCup: number;
  transferFeeCup: number;
  totalCupWithExtras: number;
  hasUnpricedItems: boolean;
}

export function summarizeCart(
  items: CartItem[],
  settings: StoreSettings,
  deliveryType: DeliveryType,
  paymentMethod: PaymentMethod
): CartSummary {
  let totalUnits = 0;
  let subtotalCup = 0;
  let hasUnpricedItems = false;
  const rate = settings.usd_to_cup_rate > 0 ? settings.usd_to_cup_rate : 980;

  for (const item of items) {
    totalUnits += item.qty;
    if (item.product.price === null || !Number.isFinite(item.product.price)) {
      hasUnpricedItems = true;
      continue;
    }
    const unitCup = priceInCup(item.product.price, item.product.currency, rate) ?? 0;
    subtotalCup += unitCup * item.qty;
  }

  const subtotalUsd = Math.round((subtotalCup / rate) * 100) / 100;
  const deliveryFeeCup =
    deliveryType === 'domicilio' && items.length > 0 ? Math.round(settings.delivery_fee_cup) : 0;
  const transferFeeCup =
    paymentMethod === 'transferencia' && subtotalCup > 0
      ? Math.round((subtotalCup * settings.transfer_surcharge_pct) / 100)
      : 0;

  return {
    totalUnits,
    subtotalCup,
    subtotalUsd,
    deliveryFeeCup,
    transferFeeCup,
    totalCupWithExtras: subtotalCup + deliveryFeeCup + transferFeeCup,
    hasUnpricedItems,
  };
}

export function normalizeWhatsAppDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) return `53${digits}`;
  if (digits.startsWith('0053')) return digits.slice(2);
  return digits || '5352678747';
}

function formatDualPriceForMessage(
  price: number | null,
  currency: Currency,
  usdToCupRate: number,
  qty = 1
): string {
  if (price === null || !Number.isFinite(price)) return 'Por confirmar';
  const total = price * qty;
  const cup = priceInCup(total, currency, usdToCupRate) ?? 0;
  const usd = priceInUsd(total, currency, usdToCupRate) ?? 0;
  const usdStr = Math.abs(usd - Math.round(usd)) < 0.005 ? String(Math.round(usd)) : usd.toFixed(2);
  return `${usdStr} usd (moneda nacional ${cup})`;
}

export function buildWhatsAppProductLink(
  product: Product,
  selectedSize: string,
  settings: StoreSettings
): string {
  const phone = normalizeWhatsAppDigits(settings.whatsapp_number);
  const priceText = formatDualPriceForMessage(
    product.price,
    product.currency,
    settings.usd_to_cup_rate
  );
  const sizePart = selectedSize ? ` ${selectedSize}` : '';
  const msg = [
    '✨YoleShop✨',
    '',
    `✨Producto: [${product.sku}] ${product.title}`,
    '',
    `💵 Precio del producto: ${priceText}${sizePart}`,
    '',
    '¿Está disponible?',
  ].join('\n');
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export function formatWhatsAppOrderText(params: {
  orderCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: DeliveryType;
  deliveryAddress: string;
  paymentMethod: PaymentMethod;
  deliveryTime?: string;
  notes: string;
  items: Array<{
    sku: string;
    title: string;
    size: string;
    qty: number;
    currency: Currency;
    unit_price: number | null;
  }>;
  summary: {
    subtotalCup: number;
    subtotalUsd: number;
    deliveryFeeCup: number;
    transferFeeCup: number;
    totalCupWithExtras: number;
    hasUnpricedItems: boolean;
  };
  settings: StoreSettings;
  includeManager?: boolean;
}): string {
  const rate = params.settings.usd_to_cup_rate > 0 ? params.settings.usd_to_cup_rate : 980;
  const single = params.items.length === 1 ? params.items[0] : null;

  const productLine = single
    ? `✨Producto: ${single.qty > 1 ? `${single.qty}x ` : ''}[${single.sku}] ${single.title}`
    : [
        '✨Producto:',
        ...params.items.map((it) => {
          const p = formatDualPriceForMessage(it.unit_price, it.currency, rate, it.qty);
          return `• ${it.qty}x [${it.sku}] ${it.title} (${it.size || 'Única'}) — ${p}`;
        }),
      ].join('\n');

  let priceLineValue: string;
  if (single) {
    const baseDual = formatDualPriceForMessage(single.unit_price, single.currency, rate, single.qty);
    const sizeStr = single.size && single.size !== 'Única' ? ` ${single.size}` : '';
    priceLineValue = `${baseDual}${sizeStr}`;
  } else if (params.summary.subtotalCup > 0) {
    const usdVal = params.summary.subtotalUsd;
    const usdStr =
      Math.abs(usdVal - Math.round(usdVal)) < 0.005 ? String(Math.round(usdVal)) : usdVal.toFixed(2);
    priceLineValue = `${usdStr} usd (moneda nacional ${Math.round(params.summary.subtotalCup)})${
      params.summary.hasUnpricedItems ? ' + artículos por confirmar' : ''
    }`;
  } else {
    priceLineValue = 'Por confirmar';
  }

  const addressValue =
    params.deliveryType === 'domicilio'
      ? params.deliveryAddress.trim() || 'Por definir'
      : 'Recogida presencial';

  const deliveryFeeValue =
    params.deliveryType === 'domicilio'
      ? params.summary.deliveryFeeCup > 0
        ? `${Math.round(params.summary.deliveryFeeCup)} CUP`
        : ''
      : 'Recogida (0 CUP)';

  const paymentValue =
    params.paymentMethod === 'efectivo'
      ? 'efectivo'
      : params.paymentMethod === 'usd'
        ? 'efectivo USD'
        : `transferencia (+${params.settings.transfer_surcharge_pct}% = ${Math.round(params.summary.transferFeeCup)} CUP)`;

  const timeValue = (params.deliveryTime || '').trim() || '';

  const lines = [
    '✨YoleShop✨',
    '',
    productLine,
    '',
    `💵 Precio del producto: ${priceLineValue}`,
    '',
    `📍 Dirección: ${addressValue}`,
    '',
    `📞 Número de teléfono: ${params.customerPhone.trim()}`,
    '',
    `🛵Precio del domicilio: ${deliveryFeeValue}`,
    '',
    `👤 Nombre del cliente: ${params.customerName.trim()}`,
    '',
    `💳 Tipo de pago: ${paymentValue}`,
    '',
    `🕒 Hora de la entrega: ${timeValue}`,
  ];

  if (params.notes.trim()) {
    lines.push('', `📝 Nota: ${params.notes.trim()}`);
  }
  if (params.includeManager) {
    lines.push('', '🙋🏼‍♀️Gestor: yolexsis');
  }
  if (params.orderCode) {
    lines.push('', `Código: ${params.orderCode}`);
  }

  return lines.join('\n');
}

export function buildWhatsAppOrderLink(params: {
  orderCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: DeliveryType;
  deliveryAddress: string;
  paymentMethod: PaymentMethod;
  deliveryTime?: string;
  notes: string;
  items: CartItem[];
  summary: CartSummary;
  settings: StoreSettings;
}): string {
  const phone = normalizeWhatsAppDigits(params.settings.whatsapp_number);
  const text = formatWhatsAppOrderText({
    ...params,
    items: params.items.map((it) => ({
      sku: it.product.sku,
      title: it.product.title,
      size: it.size,
      qty: it.qty,
      currency: it.product.currency,
      unit_price: it.product.price,
    })),
    includeManager: false,
  });
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
