import type { Product, StoreSettings } from '../types';
import { getDisplayPrice } from './pricing';
import { getAvailableSizes } from './catalog';

export async function downloadRemoteImage(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  } catch {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export function buildProductShareUrl(sku: string): string {
  if (typeof window === 'undefined') {
    return `https://yole-shop.vercel.app/?sku=${encodeURIComponent(sku)}`;
  }
  return `${window.location.origin}/?sku=${encodeURIComponent(sku)}`;
}

export async function shareProductLink(
  product: Product
): Promise<'shared' | 'copied' | 'failed'> {
  const url = buildProductShareUrl(product.sku);
  const title = `${product.title} · Yole Shop`;
  const text = `Mira ${product.title} (${product.sku}) en Yole Shop:`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch {
      // Fall back to clipboard if user cancels or platform rejects share
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

function loadCorsImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la foto del producto para la tarjeta.'));
    img.src = url;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) {
    lines.push(cur);
  }
  return lines.slice(0, maxLines);
}

/**
 * Genera una tarjeta vertical 1080x1350 lista para subir a Estados de WhatsApp / Instagram.
 */
export async function generateWhatsAppStatusCard(
  product: Product,
  settings: StoreSettings
): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite generar tarjetas.');

  // Fondo editorial limpio
  ctx.fillStyle = '#f8f8f7';
  ctx.fillRect(0, 0, W, H);

  // Header negro superior
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, 118);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 38px Inter, Arial, sans-serif';
  ctx.fillText(settings.store_name.toUpperCase(), 54, 62);

  ctx.fillStyle = '#a3a3a3';
  ctx.font = '600 22px Inter, Arial, sans-serif';
  ctx.fillText(settings.location_text, 54, 96);

  // Badge SKU arriba a la derecha
  ctx.fillStyle = '#262626';
  drawRoundedRect(ctx, W - 240, 32, 186, 54, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 26px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(product.sku, W - 147, 68);
  ctx.textAlign = 'left';

  // Marco de foto
  const imgX = 54;
  const imgY = 148;
  const imgW = W - 108;
  const imgH = 740;

  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, imgX, imgY, imgW, imgH, 24);
  ctx.fill();
  ctx.strokeStyle = '#e5e5e5';
  ctx.lineWidth = 3;
  ctx.stroke();

  const img = await loadCorsImage(product.image_url);
  ctx.save();
  drawRoundedRect(ctx, imgX + 6, imgY + 6, imgW - 12, imgH - 12, 20);
  ctx.clip();
  const scale = Math.min((imgW - 12) / img.naturalWidth, (imgH - 12) / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = imgX + (imgW - dw) / 2;
  const dy = imgY + (imgH - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();

  // Badge calidad sobre foto
  if (product.quality) {
    ctx.fillStyle = '#0a0a0a';
    drawRoundedRect(ctx, imgX + 24, imgY + 24, 175, 48, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 22px Inter, Arial, sans-serif';
    ctx.fillText(product.quality.toUpperCase(), imgX + 42, imgY + 56);
  }

  // Título y detalles
  ctx.fillStyle = '#525252';
  ctx.font = '700 24px Inter, Arial, sans-serif';
  ctx.fillText(product.brand.toUpperCase(), 54, 938);

  ctx.fillStyle = '#0a0a0a';
  ctx.font = '800 42px Inter, Arial, sans-serif';
  const titleLines = wrapTextLines(ctx, product.title, W - 108, 2);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, 54, 988 + i * 50);
  });

  // Tallas disponibles
  const availSizes = getAvailableSizes(product);
  const sizesLabel =
    availSizes.length > 0 ? `Tallas disponibles: ${availSizes.join(' · ')}` : 'Consultar tallas';
  ctx.fillStyle = '#404040';
  ctx.font = '600 26px Inter, Arial, sans-serif';
  ctx.fillText(sizesLabel, 54, 1094);

  // Caja de precio + WhatsApp CTA
  ctx.fillStyle = '#0a0a0a';
  drawRoundedRect(ctx, 54, 1136, W - 108, 162, 22);
  ctx.fill();

  const priceInfo = getDisplayPrice(product, 'CUP', settings.usd_to_cup_rate);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 50px Inter, Arial, sans-serif';
  ctx.fillText(priceInfo.primary, 86, 1208);

  if (priceInfo.secondary) {
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '700 28px Inter, Arial, sans-serif';
    ctx.fillText(priceInfo.secondary, 86, 1254);
  }

  // Botón verde WhatsApp derecha
  ctx.fillStyle = '#16a34a';
  drawRoundedRect(ctx, W - 404, 1172, 320, 88, 16);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 26px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PÍDELO POR WHATSAPP', W - 244, 1212);
  ctx.font = '700 22px Inter, Arial, sans-serif';
  ctx.fillText(`+${settings.whatsapp_number}`, W - 244, 1244);
  ctx.textAlign = 'left';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo exportar la imagen PNG.'))),
      'image/png'
    );
  });
}
