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
  return Math.round(price * (usdToCupRate > 0 ? usdToCupRate : 920));
}

export function priceInUsd(
  price: number | null,
  currency: Currency,
  usdToCupRate: number
): number | null {
  if (price === null || !Number.isFinite(price)) return null;
  if (currency === 'USD') return Math.round(price * 100) / 100;
  const rate = usdToCupRate > 0 ? usdToCupRate : 920;
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
  const rate = settings.usd_to_cup_rate > 0 ? settings.usd_to_cup_rate : 920;

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

export function buildWhatsAppProductLink(
  product: Product,
  selectedSize: string,
  settings: StoreSettings
): string {
  const phone = normalizeWhatsAppDigits(settings.whatsapp_number);
  const display = getDisplayPrice(product, product.currency, settings.usd_to_cup_rate);
  const priceLabel = display.isConsult ? 'Consultar precio' : `${display.primary}`;
  const sizePart = selectedSize ? ` · Talla: ${selectedSize}` : '';
  const msg = `Hola ${settings.store_name}, me interesa este artículo:\n• [${product.sku}] ${product.title}${sizePart}\n• Precio ref.: ${priceLabel}\n¿Lo tienes disponible?`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export function buildWhatsAppOrderLink(params: {
  orderCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: DeliveryType;
  deliveryAddress: string;
  paymentMethod: PaymentMethod;
  notes: string;
  items: CartItem[];
  summary: CartSummary;
  settings: StoreSettings;
}): string {
  const phone = normalizeWhatsAppDigits(params.settings.whatsapp_number);
  const lines = [
    `*NUEVO PEDIDO · ${params.settings.store_name.toUpperCase()}*`,
    `Código: ${params.orderCode}`,
    `Cliente: ${params.customerName.trim()}`,
    params.customerPhone.trim() ? `Teléfono: ${params.customerPhone.trim()}` : '',
    `Entrega: ${params.deliveryType === 'domicilio' ? 'Envío a domicilio' : 'Recogida presencial'}`,
    params.deliveryType === 'domicilio' && params.deliveryAddress.trim()
      ? `Dirección: ${params.deliveryAddress.trim()}`
      : '',
    `Pago: ${
      params.paymentMethod === 'efectivo'
        ? 'Efectivo CUP'
        : params.paymentMethod === 'usd'
          ? 'Efectivo USD'
          : `Transferencia (+${params.settings.transfer_surcharge_pct}%)`
    }`,
    '',
    '*Productos:*',
    ...params.items.map((it) => {
      const p =
        it.product.price !== null
          ? it.product.currency === 'USD'
            ? formatUsd(it.product.price * it.qty)
            : formatCup(it.product.price * it.qty)
          : 'Por confirmar';
      return `- ${it.qty}x [${it.product.sku}] ${it.product.title} (Talla: ${it.size || 'Única'}) — ${p}`;
    }),
    '',
  ];

  if (params.summary.subtotalCup > 0) {
    lines.push(`Subtotal productos: ${formatCup(params.summary.subtotalCup)} (≈ ${formatUsd(params.summary.subtotalUsd)})`);
  }
  if (params.summary.deliveryFeeCup > 0) {
    lines.push(`Domicilio base: ${formatCup(params.summary.deliveryFeeCup)}`);
  }
  if (params.summary.transferFeeCup > 0) {
    lines.push(`Recargo transferencia (${params.settings.transfer_surcharge_pct}%): ${formatCup(params.summary.transferFeeCup)}`);
  }
  if (params.summary.totalCupWithExtras > 0) {
    lines.push(`*Total estimado: ${formatCup(params.summary.totalCupWithExtras)}*`);
  }
  if (params.summary.hasUnpricedItems) {
    lines.push('_(Incluye artículos Shein/accesorios con precio por confirmar)_');
  }
  if (params.notes.trim()) {
    lines.push(`Notas: ${params.notes.trim()}`);
  }

  const text = lines.filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
