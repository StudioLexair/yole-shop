import type {
  CartItem,
  Currency,
  PaymentChannelKey,
  PaymentRatesMap,
  Product,
  ResellerConfig,
  StoreSettings,
} from '../types';
import { DEFAULT_PAYMENT_RATES } from '../types';
import { formatCup, formatUsd, getDisplayPrice, priceInUsd } from './pricing';
import { extractProductSpecs } from './specExtractor';

const RESELLER_KEY = 'yole_reseller_cfg_v1';
const REFERRAL_KEY = 'yole_referral_code_v1';
const RECENT_VIEWED_KEY = 'yole_recently_viewed_v1';
const ALERT_SUB_KEY = 'yole_alert_sub_v1';

export const PAYMENT_CHANNEL_ORDER: PaymentChannelKey[] = [
  'efectivo_usd',
  'zelle',
  'usdt',
  'mlc',
  'eur',
  'cup',
];

export interface ShippingZoneDef {
  id: string;
  label: string;
  region: string;
  parcelUsd: number;
  heavyUsd: number | null;
  eta: string;
  heavyNote: string;
}

export const SHIPPING_ZONES: ShippingZoneDef[] = [
  {
    id: 'santa-clara',
    label: 'Santa Clara · Ciudad',
    region: 'Villa Clara',
    parcelUsd: 2,
    heavyUsd: 15,
    eta: 'Entrega el mismo día (2–5 h)',
    heavyNote: 'Traslado local especializado incluido en coordinación directa',
  },
  {
    id: 'villa-clara',
    label: 'Resto de Villa Clara (Placetas, Camajuaní, Sagua, Caibarién, Remedios…)',
    region: 'Villa Clara',
    parcelUsd: 6,
    heavyUsd: 35,
    eta: 'Entrega en 24 h',
    heavyNote: 'Flete provincial puerta a puerta (camión/remolque)',
  },
  {
    id: 'centro',
    label: 'Centro (Cienfuegos, Sancti Spíritus, Ciego de Ávila, Camagüey)',
    region: 'Centro',
    parcelUsd: 10,
    heavyUsd: 65,
    eta: '24–48 h',
    heavyNote: 'Envío interprovincial coordinado con transportista',
  },
  {
    id: 'habana',
    label: 'La Habana (Todos los municipios)',
    region: 'Occidente',
    parcelUsd: 12,
    heavyUsd: 80,
    eta: '24–72 h',
    heavyNote: 'Despacho directo o punto de entrega Habana',
  },
  {
    id: 'occidente',
    label: 'Occidente (Matanzas, Mayabeque, Artemisa, Pinar del Río)',
    region: 'Occidente',
    parcelUsd: 14,
    heavyUsd: 95,
    eta: '48–72 h',
    heavyNote: 'Flete especial a coordinar según municipio',
  },
  {
    id: 'oriente',
    label: 'Oriente (Las Tunas, Holguín, Granma, Santiago, Guantánamo)',
    region: 'Oriente',
    parcelUsd: 16,
    heavyUsd: null,
    eta: '2–5 días',
    heavyNote: 'Flete pesado a cotizar según municipio exacto',
  },
];

export function cartRequiresHeavyFreight(items: CartItem[]): boolean {
  return items.some(
    (it) =>
      it.product.department === 'movilidad' ||
      (it.product.department === 'solares' && (it.product.price || 0) >= 220)
  );
}

export function calculateShippingEstimate(
  zoneId: string,
  items: CartItem[],
  deliveryType: 'domicilio' | 'recogida'
): {
  zone: ShippingZoneDef;
  isHeavy: boolean;
  feeUsd: number | null;
  label: string;
} {
  const zone = SHIPPING_ZONES.find((z) => z.id === zoneId) || SHIPPING_ZONES[0];
  const isHeavy = cartRequiresHeavyFreight(items);
  if (deliveryType === 'recogida') {
    return {
      zone,
      isHeavy,
      feeUsd: 0,
      label: 'Recogida en tienda Santa Clara · Gratis ($0)',
    };
  }
  const feeUsd = isHeavy ? zone.heavyUsd : zone.parcelUsd;
  return {
    zone,
    isHeavy,
    feeUsd,
    label:
      feeUsd !== null
        ? `${isHeavy ? 'Flete pesado base' : 'Envío base'} (${zone.label}): desde ~$${feeUsd} USD · a consultar según tienda/reparto (${zone.eta})`
        : `${zone.heavyNote} · ${zone.eta}`,
  };
}

export function formatChannelTotal(
  totalUsd: number,
  channelKey: PaymentChannelKey,
  settings: StoreSettings
): {
  channelLabel: string;
  formatted: string;
  note: string;
} {
  const rates: PaymentRatesMap = {
    ...DEFAULT_PAYMENT_RATES,
    ...(settings.payment_rates || {}),
    cup: {
      label: settings.payment_rates?.cup?.label || 'CUP Efectivo',
      mode: 'rate',
      value: settings.usd_to_cup_rate || 980,
    },
  };
  const cfg = rates[channelKey] || rates.efectivo_usd;

  if (channelKey === 'cup') {
    const cup = Math.round(totalUsd * (cfg.value || settings.usd_to_cup_rate || 980));
    return {
      channelLabel: cfg.label,
      formatted: `${cup.toLocaleString('es-CU')} CUP`,
      note: `Tasa ${cfg.value} CUP/USD`,
    };
  }
  if (channelKey === 'eur') {
    const eur = Math.round(totalUsd * (cfg.value || 0.92) * 100) / 100;
    return {
      channelLabel: cfg.label,
      formatted: `€${eur.toLocaleString('es-CU', { maximumFractionDigits: 2 })} EUR`,
      note: `Tasa ${cfg.value} EUR/USD`,
    };
  }
  const pct = cfg.mode === 'pct' ? cfg.value : 0;
  const adjusted = Math.round(totalUsd * (1 + pct / 100) * 100) / 100;
  const suffix = channelKey === 'zelle' ? 'Zelle' : channelKey === 'usdt' ? 'USDT' : channelKey === 'mlc' ? 'MLC' : 'USD';
  return {
    channelLabel: cfg.label,
    formatted: `$${adjusted.toLocaleString('es-CU', { maximumFractionDigits: 2 })} ${suffix}`,
    note: pct > 0 ? `+${pct}% comisión canal` : pct < 0 ? `${pct}% descuento` : 'Sin recargo (1:1)',
  };
}

export const DEFAULT_RESELLER_CONFIG: ResellerConfig = {
  enabled: false,
  mode: 'usd',
  value: 15,
  gestorName: '',
  hideYoleSku: false,
};

export function readResellerConfig(): ResellerConfig {
  if (typeof window === 'undefined') return DEFAULT_RESELLER_CONFIG;
  try {
    const raw = window.localStorage.getItem(RESELLER_KEY);
    if (!raw) return DEFAULT_RESELLER_CONFIG;
    return { ...DEFAULT_RESELLER_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_RESELLER_CONFIG;
  }
}

export function saveResellerConfig(cfg: ResellerConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RESELLER_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export function applyResellerMarkupUsd(
  baseUsd: number | null,
  reseller?: ResellerConfig
): number | null {
  if (baseUsd === null) return null;
  if (!reseller?.enabled || reseller.value <= 0) return baseUsd;
  if (reseller.mode === 'pct') {
    return Math.round(baseUsd * (1 + reseller.value / 100) * 100) / 100;
  }
  return Math.round((baseUsd + reseller.value) * 100) / 100;
}

export function getClientFacingPrice(
  product: Product,
  displayCurrency: Currency,
  usdToCupRate: number,
  reseller?: ResellerConfig
): {
  formatted: string;
  secondaryFormatted: string;
  amount: number | null;
  hasResellerMarkup: boolean;
} {
  if (!reseller?.enabled || reseller.value <= 0) {
    const dp = getDisplayPrice(product, displayCurrency, usdToCupRate);
    return {
      formatted: dp.primary,
      secondaryFormatted: dp.secondary || '',
      amount:
        displayCurrency === 'CUP'
          ? priceInUsd(product.price, product.currency, usdToCupRate)
          : priceInUsd(product.price, product.currency, usdToCupRate),
      hasResellerMarkup: false,
    };
  }

  const baseUsd = priceInUsd(product.price, product.currency, usdToCupRate);
  if (baseUsd === null) {
    return {
      formatted: 'Consultar precio',
      secondaryFormatted: '',
      amount: null,
      hasResellerMarkup: false,
    };
  }
  const finalUsd = applyResellerMarkupUsd(baseUsd, reseller) ?? baseUsd;
  const finalCup = Math.round(finalUsd * (usdToCupRate || 980));
  if (displayCurrency === 'CUP') {
    return {
      formatted: formatCup(finalCup),
      secondaryFormatted: `≈ ${formatUsd(finalUsd)}`,
      amount: finalCup,
      hasResellerMarkup: true,
    };
  }
  return {
    formatted: formatUsd(finalUsd),
    secondaryFormatted: formatCup(finalCup),
    amount: finalUsd,
    hasResellerMarkup: true,
  };
}

export function captureReferralFromUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get('ref') || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
    if (ref) {
      window.localStorage.setItem(REFERRAL_KEY, ref.toUpperCase());
      return ref.toUpperCase();
    }
    return readReferralCode();
  } catch {
    return '';
  }
}

export function readReferralCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (window.localStorage.getItem(REFERRAL_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function buildReferralShareUrl(gestorName: string): string {
  const clean = gestorName.trim().replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
  if (typeof window === 'undefined') return `https://yoleshop.ddns.net/?ref=${clean}`;
  const url = new URL(window.location.origin);
  if (clean) url.searchParams.set('ref', clean);
  return url.toString();
}

export function readRecentlyViewedSkus(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_VIEWED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecentlyViewedSku(sku: string): string[] {
  if (typeof window === 'undefined' || !sku) return [];
  const next = [sku, ...readRecentlyViewedSkus().filter((s) => s !== sku)].slice(0, 12);
  try {
    window.localStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function readAlertSubscribed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ALERT_SUB_KEY) === '1';
  } catch {
    return false;
  }
}

export function markAlertSubscribedLocal(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ALERT_SUB_KEY, '1');
  } catch {
    // ignore
  }
}

export async function triggerBrowserDropNotification(
  title: string,
  body: string
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          body,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: 'yole-drop-alert',
        });
        return true;
      }
    }
    new Notification(title, { body, icon: '/favicon.svg' });
    return true;
  } catch {
    return false;
  }
}

async function loadImageForCanvas(url: string): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
): number {
  const words = text.split(' ');
  let line = '';
  let linesDrawn = 0;
  let curY = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      linesDrawn++;
      curY += lineHeight;
      line = words[i];
      if (linesDrawn >= maxLines - 1) {
        const rest = words.slice(i).join(' ');
        const clipped =
          rest.length > 42 ? `${rest.slice(0, 39)}...` : rest;
        ctx.fillText(clipped, x, curY);
        return curY + lineHeight;
      }
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, curY);
    curY += lineHeight;
  }
  return curY;
}

/**
 * Empaqueta un JPEG en un PDF 1.4 válido sin dependencias externas.
 */
export function buildSinglePagePdfFromJpeg(
  jpegBytes: Uint8Array,
  pageWidthPt = 595,
  pageHeightPt = 842,
  imgPxW = 1240,
  imgPxH = 1754
): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [0];

  const pushStr = (s: string) => {
    const b = encoder.encode(s);
    chunks.push(b);
    offset += b.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.length;
  };

  pushStr('%PDF-1.4\n');
  pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1: Catalog
  offsets.push(offset);
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  offsets.push(offset);
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3: Page
  offsets.push(offset);
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  // 4: Image XObject
  offsets.push(offset);
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgPxW} /Height ${imgPxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr('\nendstream\nendobj\n');

  // 5: Content stream
  const contentCmd = `q ${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm /Im0 Do Q`;
  offsets.push(offset);
  pushStr(
    `5 0 obj\n<< /Length ${contentCmd.length} >>\nstream\n${contentCmd}\nendstream\nendobj\n`
  );

  // xref
  const xrefStart = offset;
  pushStr(`xref\n0 ${offsets.length}\n`);
  pushStr('0000000000 65535 f \n');
  for (let i = 1; i < offsets.length; i++) {
    pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  );

  return new Blob(chunks as unknown as BlobPart[], { type: 'application/pdf' });
}

export async function downloadFormalQuotePdf(params: {
  items: Array<{ product: Product; size?: string; qty: number }>;
  settings: StoreSettings;
  reseller?: ResellerConfig;
  shippingLabel?: string;
  shippingFeeUsd?: number | null;
  customerName?: string;
  referralCode?: string;
}): Promise<string> {
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el generador de cotización');

  const folio = `YOL-COT-${Math.floor(1000 + Math.random() * 9000)}`;
  const dateStr = new Date().toLocaleDateString('es-CU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Clean paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.fillStyle = '#111214';
  ctx.fillRect(0, 0, W, 210);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px system-ui, -apple-system, sans-serif';
  const brandTitle =
    params.reseller?.enabled && params.reseller.gestorName
      ? `${params.reseller.gestorName.toUpperCase()} · COTIZACIÓN`
      : `${(params.settings.store_name || 'YOLE SHOP').toUpperCase()} · COTIZACIÓN FORMAL`;
  ctx.fillText(brandTitle, 72, 92);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '500 24px system-ui, sans-serif';
  ctx.fillText(
    `${params.settings.location_text || 'Santa Clara, Villa Clara · Cuba'} · WhatsApp +${params.settings.whatsapp_number}`,
    72,
    138
  );
  ctx.fillStyle = '#34d399';
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillText(`Folio: ${folio}   ·   Fecha: ${dateStr}   ·   Validez: 48 horas`, 72, 178);

  let y = 256;
  if (params.customerName || params.referralCode) {
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(72, y - 34, W - 144, 62);
    ctx.fillStyle = '#18181b';
    ctx.font = '600 23px system-ui, sans-serif';
    const parts = [
      params.customerName ? `Cliente: ${params.customerName}` : '',
      params.referralCode ? `Asesor / Ref: ${params.referralCode}` : '',
    ].filter(Boolean);
    ctx.fillText(parts.join('   ·   '), 96, y + 4);
    y += 76;
  }

  let totalUsd = 0;
  let hasUnpriced = false;

  const displayItems = params.items.slice(0, 4);
  for (const entry of displayItems) {
    const p = entry.product;
    const baseUsd = priceInUsd(p.price, p.currency, params.settings.usd_to_cup_rate);
    const unitUsd = applyResellerMarkupUsd(baseUsd, params.reseller);
    if (unitUsd !== null) {
      totalUsd += unitUsd * entry.qty;
    } else {
      hasUnpriced = true;
    }
    const unitCup = unitUsd !== null ? Math.round(unitUsd * params.settings.usd_to_cup_rate) : null;
    const specs = extractProductSpecs(p);

    // Item card box
    ctx.strokeStyle = '#e4e4e7';
    ctx.lineWidth = 2;
    ctx.strokeRect(72, y, W - 144, 240);

    // Product image thumbnail
    const img = await loadImageForCanvas(p.image_url);
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(92, y + 20, 200, 200);
    if (img) {
      ctx.drawImage(img, 92, y + 20, 200, 200);
    }

    // Text column
    ctx.fillStyle = '#18181b';
    ctx.font = '700 28px system-ui, sans-serif';
    const nextY = wrapText(ctx, p.title, 320, y + 54, 560, 34, 2);

    ctx.fillStyle = '#52525b';
    ctx.font = '500 21px system-ui, sans-serif';
    const metaLine = [
      !params.reseller?.hideYoleSku ? `SKU ${p.sku}` : '',
      p.brand || '',
      entry.size ? `Opción: ${entry.size}` : '',
      `Cant: ${entry.qty}`,
    ]
      .filter(Boolean)
      .join(' · ');
    ctx.fillText(metaLine, 320, nextY + 6);

    const specSummary = specs.rows
      .slice(0, 3)
      .map((r) => `${r.label}: ${r.value}`)
      .join('  |  ');
    if (specSummary) {
      ctx.fillStyle = '#0f766e';
      ctx.font = '600 19px system-ui, sans-serif';
      wrapText(ctx, specSummary, 320, nextY + 42, 580, 26, 2);
    }

    // Price right side
    ctx.textAlign = 'right';
    ctx.fillStyle = '#111214';
    ctx.font = '800 32px system-ui, sans-serif';
    ctx.fillText(
      unitUsd !== null ? `$${(unitUsd * entry.qty).toLocaleString('es-CU')} USD` : 'Consultar',
      W - 96,
      y + 66
    );
    if (unitCup !== null) {
      ctx.fillStyle = '#71717a';
      ctx.font = '600 21px system-ui, sans-serif';
      ctx.fillText(
        `${(unitCup * entry.qty).toLocaleString('es-CU')} CUP`,
        W - 96,
        y + 104
      );
    }
    ctx.textAlign = 'left';

    y += 264;
  }

  if (params.items.length > 4) {
    ctx.fillStyle = '#52525b';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(`+ ${params.items.length - 4} artículo(s) adicional(es) incluidos en el total`, 72, y + 16);
    y += 48;
  }

  // Totals Box
  const boxY = Math.max(y + 16, H - 390);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(72, boxY, W - 144, 210);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(72, boxY, W - 144, 210);

  const shipUsd = params.shippingFeeUsd ?? 0;
  const grandUsd = Math.round((totalUsd + shipUsd) * 100) / 100;
  const grandCup = Math.round(grandUsd * (params.settings.usd_to_cup_rate || 980));

  ctx.fillStyle = '#334155';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText(
    params.shippingLabel ||
      'Domicilio: precio base orientativo (sujeto a tienda, reparto o municipio)',
    100,
    boxY + 52
  );

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 40px system-ui, sans-serif';
  ctx.fillText(
    hasUnpriced
      ? `Total estimado: $${grandUsd.toLocaleString('es-CU')} USD + ítems a consultar`
      : `TOTAL COTIZADO: $${grandUsd.toLocaleString('es-CU')} USD`,
    100,
    boxY + 118
  );

  ctx.fillStyle = '#475569';
  ctx.font = '600 26px system-ui, sans-serif';
  ctx.fillText(
    `Equivalente aprox.: ${grandCup.toLocaleString('es-CU')} CUP (tasa ref. ${params.settings.usd_to_cup_rate} CUP/USD)`,
    100,
    boxY + 166
  );

  // Footer
  ctx.fillStyle = '#71717a';
  ctx.font = '500 20px system-ui, sans-serif';
  ctx.fillText(
    params.settings.no_returns_notice ||
      'Por favor compruebe su mercancía al momento de recibirla.',
    72,
    H - 96
  );
  ctx.fillStyle = '#111214';
  ctx.font = '700 21px system-ui, sans-serif';
  ctx.fillText(
    `Catálogo en vivo: https://yoleshop.ddns.net   ·   Documento generado desde ${params.settings.store_name}`,
    72,
    H - 56
  );

  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const b64 = jpegDataUrl.split(',')[1] || '';
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }

  const pdfBlob = buildSinglePagePdfFromJpeg(bytes, 595, 842, W, H);
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${folio.toLowerCase()}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  return folio;
}

export type StoryThemeKey = 'urbano' | 'solar' | 'movilidad' | 'oferta';

export async function renderStatusStoryDataUrl(params: {
  products: Product[];
  theme: StoryThemeKey;
  headline: string;
  settings: StoreSettings;
  reseller?: ResellerConfig;
}): Promise<string> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');

  const themes: Record<StoryThemeKey, { bg1: string; bg2: string; accent: string; badge: string }> = {
    urbano: { bg1: '#09090b', bg2: '#18181b', accent: '#f97316', badge: 'DROP URBANO · EN STOCK' },
    solar: { bg1: '#042f2e', bg2: '#0f172a', accent: '#10b981', badge: 'ENERGÍA SOLAR · RESPUESTA INMEDIATA' },
    movilidad: { bg1: '#0f172a', bg2: '#1e1b4b', accent: '#38bdf8', badge: 'MOTOS & TODO VIRGINIA' },
    oferta: { bg1: '#18181b', bg2: '#450a0a', accent: '#fbbf24', badge: 'OFERTA FLASH · YOLE SHOP' },
  };
  const pal = themes[params.theme];

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, pal.bg1);
  grad.addColorStop(1, pal.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Top Pill
  ctx.fillStyle = pal.accent;
  ctx.beginPath();
  ctx.roundRect(72, 88, 560, 62, 31);
  ctx.fill();
  ctx.fillStyle = '#09090b';
  ctx.font = '800 26px system-ui, sans-serif';
  ctx.fillText(pal.badge, 108, 128);

  // Main Headline
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 56px system-ui, sans-serif';
  let curY = wrapText(
    ctx,
    params.headline || params.settings.store_name,
    72,
    228,
    W - 144,
    68,
    2
  );

  const items = params.products.slice(0, 3);
  if (items.length === 1) {
    const p = items[0];
    const img = await loadImageForCanvas(p.image_url);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.roundRect(72, curY + 24, W - 144, 860, 40);
    ctx.fill();
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(102, curY + 54, W - 204, 800, 28);
      ctx.clip();
      ctx.drawImage(img, 102, curY + 54, W - 204, 800);
      ctx.restore();
    }

    curY += 930;
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 44px system-ui, sans-serif';
    curY = wrapText(ctx, p.title, 72, curY + 20, W - 144, 54, 2);

    const price = getClientFacingPrice(
      p,
      'USD',
      params.settings.usd_to_cup_rate,
      params.reseller
    );
    ctx.fillStyle = pal.accent;
    ctx.font = '900 72px system-ui, sans-serif';
    ctx.fillText(price.formatted, 72, curY + 76);

    if (price.secondaryFormatted) {
      ctx.fillStyle = '#d4d4d8';
      ctx.font = '600 32px system-ui, sans-serif';
      ctx.fillText(price.secondaryFormatted, 72, curY + 126);
    }

    const specs = extractProductSpecs(p).pills.slice(0, 3).map((x) => x.label);
    const sizesStr =
      specs.length > 0
        ? specs.join(' · ')
        : p.sizes.length > 0
          ? `Tallas / Opciones: ${p.sizes.slice(0, 6).join(', ')}`
          : '';
    if (sizesStr) {
      ctx.fillStyle = '#e4e4e7';
      ctx.font = '600 30px system-ui, sans-serif';
      ctx.fillText(sizesStr, 72, curY + 190);
    }
  } else {
    let rowY = curY + 34;
    for (const p of items) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.roundRect(72, rowY, W - 144, 380, 32);
      ctx.fill();

      const img = await loadImageForCanvas(p.image_url);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(98, rowY + 28, 324, 324, 24);
        ctx.clip();
        ctx.drawImage(img, 98, rowY + 28, 324, 324);
        ctx.restore();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 34px system-ui, sans-serif';
      const ty = wrapText(ctx, p.title, 456, rowY + 84, 520, 42, 3);

      const price = getClientFacingPrice(
        p,
        'USD',
        params.settings.usd_to_cup_rate,
        params.reseller
      );
      ctx.fillStyle = pal.accent;
      ctx.font = '900 48px system-ui, sans-serif';
      ctx.fillText(price.formatted, 456, Math.max(ty + 48, rowY + 260));

      if (price.secondaryFormatted) {
        ctx.fillStyle = '#d4d4d8';
        ctx.font = '600 26px system-ui, sans-serif';
        ctx.fillText(price.secondaryFormatted, 456, Math.max(ty + 94, rowY + 308));
      }

      rowY += 410;
    }
  }

  // Footer CTA bar
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(72, H - 208, W - 144, 128, 32);
  ctx.fill();
  ctx.fillStyle = '#111214';
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillText(`📲 Pídelo hoy por WhatsApp: +${params.settings.whatsapp_number}`, 110, H - 150);
  ctx.fillStyle = '#52525b';
  ctx.font = '600 26px system-ui, sans-serif';
  ctx.fillText('Catálogo completo con stock real: yoleshop.ddns.net', 110, H - 104);

  return canvas.toDataURL('image/png');
}
