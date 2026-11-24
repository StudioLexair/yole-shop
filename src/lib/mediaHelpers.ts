import type { Product, StoreSettings } from '../types';
import { formatCup, formatUsd, getDisplayPrice } from './pricing';
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
    return `https://yoleshop.ddns.net/p/${encodeURIComponent(sku)}`;
  }
  return `${window.location.origin}/p/${encodeURIComponent(sku)}`;
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

function loadOptionalImage(url: string): Promise<HTMLImageElement | null> {
  return loadCorsImage(url).catch(() => null);
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
 * Genera una historia / flyer vertical 1080x1920 con diseño obsidian + lobo oficial
 * lista para Estados de WhatsApp / Instagram Stories.
 */
export async function generateWhatsAppStatusCard(
  product: Product,
  settings: StoreSettings
): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite generar flyers.');

  // Fondo Obsidian con aura fuego
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#09090b');
  bg.addColorStop(0.5, '#140c0a');
  bg.addColorStop(1, '#09090b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 540, 40, W / 2, 540, 560);
  glow.addColorStop(0, 'rgba(249, 115, 22, 0.25)');
  glow.addColorStop(0.6, 'rgba(220, 38, 38, 0.09)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Header con Logo del Lobo + Nombre tienda + SKU
  const [img, logoMark] = await Promise.all([
    loadCorsImage(product.image_url),
    loadOptionalImage('/brand-mark.webp'),
  ]);

  if (logoMark) {
    ctx.save();
    drawRoundedRect(ctx, 56, 66, 94, 94, 24);
    ctx.clip();
    ctx.drawImage(logoMark, 56, 66, 94, 94);
    ctx.restore();
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 44px Inter, Arial, sans-serif';
  ctx.fillText(settings.store_name.toUpperCase(), logoMark ? 172 : 56, 112);

  ctx.fillStyle = '#fdba74';
  ctx.font = '700 24px Inter, Arial, sans-serif';
  ctx.fillText(settings.location_text.toUpperCase(), logoMark ? 172 : 56, 148);

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  drawRoundedRect(ctx, W - 260, 80, 204, 62, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(249, 115, 22, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 28px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(product.sku, W - 158, 121);
  ctx.textAlign = 'left';

  // Marco foto principal (1080x1000 aprox)
  const imgX = 56;
  const imgY = 205;
  const imgW = W - 112;
  const imgH = 980;

  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, imgX, imgY, imgW, imgH, 34);
  ctx.fill();

  ctx.save();
  drawRoundedRect(ctx, imgX + 10, imgY + 10, imgW - 20, imgH - 20, 28);
  ctx.clip();
  const scale = Math.min((imgW - 24) / img.naturalWidth, (imgH - 24) / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, imgX + (imgW - dw) / 2, imgY + (imgH - dh) / 2, dw, dh);
  ctx.restore();

  if (product.quality) {
    ctx.fillStyle = '#0a0a0a';
    drawRoundedRect(ctx, imgX + 28, imgY + 28, 220, 58, 14);
    ctx.fill();
    ctx.fillStyle = '#fb923c';
    ctx.font = '800 24px Inter, Arial, sans-serif';
    ctx.fillText(`CALIDAD ${product.quality.toUpperCase()}`, imgX + 48, imgY + 66);
  }

  // Marca y Título
  ctx.fillStyle = '#fb923c';
  ctx.font = '800 28px Inter, Arial, sans-serif';
  ctx.fillText(product.brand.toUpperCase(), 56, 1255);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 50px Inter, Arial, sans-serif';
  const titleLines = wrapTextLines(ctx, product.title, W - 112, 2);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, 56, 1320 + i * 60);
  });

  // Píldoras de tallas disponibles
  const availSizes = getAvailableSizes(product);
  const sizesToShow = availSizes.length > 0 ? availSizes.slice(0, 7) : ['Consultar'];
  let sx = 56;
  const sy = 1435;
  ctx.font = '800 26px Inter, Arial, sans-serif';
  for (const sz of sizesToShow) {
    const tw = Math.max(82, ctx.measureText(sz).width + 38);
    if (sx + tw > W - 56) break;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    drawRoundedRect(ctx, sx, sy, tw, 54, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(sz, sx + tw / 2, sy + 36);
    ctx.textAlign = 'left';
    sx += tw + 14;
  }

  // Tarjeta precio dual + WhatsApp CTA
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  drawRoundedRect(ctx, 56, 1530, W - 112, 210, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const priceInfo = getDisplayPrice(product, 'CUP', settings.usd_to_cup_rate);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 56px Inter, Arial, sans-serif';
  ctx.fillText(priceInfo.primary, 92, 1618);

  if (priceInfo.secondary) {
    ctx.fillStyle = '#d4d4d8';
    ctx.font = '700 32px Inter, Arial, sans-serif';
    ctx.fillText(priceInfo.secondary, 92, 1678);
  }

  ctx.fillStyle = '#16a34a';
  drawRoundedRect(ctx, W - 442, 1572, 354, 126, 22);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PÍDELO POR WHATSAPP', W - 265, 1624);
  ctx.font = '700 25px Inter, Arial, sans-serif';
  ctx.fillText(`+${settings.whatsapp_number}`, W - 265, 1666);
  ctx.textAlign = 'left';

  // Pie de historia
  ctx.fillStyle = '#71717a';
  ctx.font = '700 24px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('yoleshop.ddns.net · Catálogo actualizado al día', W / 2, 1835);
  ctx.textAlign = 'left';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo exportar la historia PNG.'))),
      'image/png'
    );
  });
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Abre una vista de Catálogo PDF imprimible (Guardar como PDF) lista para enviar por WhatsApp.
 */
export function openPrintableCatalogPdf(
  products: Product[],
  settings: StoreSettings,
  heading = 'Catálogo Oficial Yole Shop'
): void {
  if (typeof window === 'undefined') return;
  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('Activa las ventanas emergentes para generar el catálogo PDF.');
  }
  const active = products.filter((p) => p.status !== 'hidden').slice(0, 120);
  const rate = settings.usd_to_cup_rate > 0 ? settings.usd_to_cup_rate : 980;
  const cards = active
    .map((p) => {
      const avail = getAvailableSizes(p);
      const disp = getDisplayPrice(p, 'CUP', rate);
      return `
      <div class="card">
        <div class="img-wrap"><img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.title)}" /></div>
        <div class="meta">
          <span class="sku">${escapeHtml(p.sku)}</span>
          ${p.quality ? `<span class="qual">${escapeHtml(p.quality)}</span>` : ''}
        </div>
        <h3>${escapeHtml(p.title)}</h3>
        <div class="sizes">${escapeHtml(avail.length ? `Tallas: ${avail.join(', ')}` : 'Consultar talla')}</div>
        <div class="price">${escapeHtml(disp.primary)} ${disp.secondary ? `<small>${escapeHtml(disp.secondary)}</small>` : ''}</div>
      </div>`;
    })
    .join('');

  win.document.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(heading)} · ${escapeHtml(settings.store_name)}</title>
<style>
  * { box-sizing: border-box; font-family: Inter, system-ui, sans-serif; }
  body { margin: 0; padding: 24px; color: #0a0a0a; background: #fff; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0a0a0a; padding-bottom: 14px; margin-bottom: 20px; }
  .head-left { display: flex; align-items: center; gap: 12px; }
  .head-left img { width: 48px; height: 48px; border-radius: 10px; }
  h1 { margin: 0; font-size: 22px; }
  p { margin: 2px 0 0; color: #525252; font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .card { border: 1px solid #e5e5e5; border-radius: 12px; padding: 10px; break-inside: avoid; }
  .img-wrap { aspect-ratio: 1 / 1; background: #f5f5f4; border-radius: 8px; overflow: hidden; display: grid; place-items: center; }
  .img-wrap img { width: 100%; height: 100%; object-fit: cover; }
  .meta { display: flex; justify-content: space-between; margin-top: 8px; font-size: 10px; font-weight: 700; color: #737373; }
  h3 { margin: 4px 0; font-size: 12.5px; line-height: 1.25; }
  .sizes { font-size: 11px; color: #525252; }
  .price { margin-top: 6px; font-size: 14px; font-weight: 800; }
  .price small { font-weight: 600; color: #737373; margin-left: 4px; }
  .no-print { margin-bottom: 14px; display: flex; gap: 10px; }
  .no-print button { background: #0a0a0a; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; font-weight: 700; cursor: pointer; }
  @media print { .no-print { display: none; } body { padding: 10px; } }
</style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">Guardar como PDF / Imprimir catálogo</button>
  </div>
  <header class="head">
    <div class="head-left">
      <img src="${window.location.origin}/brand-mark.webp" alt="Logo" />
      <div>
        <h1>${escapeHtml(heading)}</h1>
        <p>${escapeHtml(settings.location_text)} · WhatsApp +${escapeHtml(settings.whatsapp_number)} · ${active.length} artículos</p>
      </div>
    </div>
    <div><small>Tasa ref: ${formatCup(rate)} / ${formatUsd(1)}</small></div>
  </header>
  <main class="grid">${cards}</main>
</body>
</html>`);
  win.document.close();
}
