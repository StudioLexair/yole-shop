import type { Currency, Department, Product, ProductStatus } from '../types';
import { sortSizesList } from './catalog';

export type AiVisionProvider = 'local_only' | 'gemini_free' | 'groq_free';

export interface PhotoSyncAiConfig {
  provider: AiVisionProvider;
  apiKey: string;
}

export interface VisualFingerprint {
  sku: string;
  productId: string;
  dhashHi: number;
  dhashLo: number;
  centerRgb: Uint8Array;
  fullRgb: Uint8Array;
}

export type SyncBucket = 'update' | 'new_product' | 'sold_out' | 'unchanged';

export interface AnalyzedPhotoItem {
  id: string;
  file: File;
  previewUrl: string;
  matchedProduct: Product | null;
  candidates: Array<{ product: Product; score: number }>;
  matchScore: number;
  bucket: SyncBucket;
  selected: boolean;
  replacePhoto: boolean;
  suggestedSku: string;
  title: string;
  brand: string;
  quality: string;
  department: Department;
  categoryId: string;
  price: number | null;
  currency: Currency;
  availableSizes: string[];
  soldOutSizes: string[];
  aiNote: string;
  status: ProductStatus;
}

export interface ParsedVisionExtraction {
  same_product?: boolean;
  price?: number | string | null;
  currency?: string;
  available_sizes?: Array<string | number>;
  crossed_out_sizes?: Array<string | number>;
  title?: string;
  brand?: string;
  quality?: string;
  department?: string;
  note?: string;
}

const AI_CFG_KEY = 'yole_photo_sync_ai_cfg_v1';
const fpCache = new Map<string, VisualFingerprint>();

export function readPhotoSyncAiConfig(): PhotoSyncAiConfig {
  if (typeof window === 'undefined') return { provider: 'local_only', apiKey: '' };
  try {
    const raw = window.localStorage.getItem(AI_CFG_KEY);
    if (!raw) return { provider: 'local_only', apiKey: '' };
    const parsed = JSON.parse(raw) as Partial<PhotoSyncAiConfig>;
    const provider: AiVisionProvider =
      parsed.provider === 'gemini_free' || parsed.provider === 'groq_free'
        ? parsed.provider
        : 'local_only';
    return { provider, apiKey: String(parsed.apiKey || '').trim() };
  } catch {
    return { provider: 'local_only', apiKey: '' };
  }
}

export function writePhotoSyncAiConfig(cfg: PhotoSyncAiConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AI_CFG_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export function clearVisualFingerprintCache(): void {
  fpCache.clear();
}

function popcount32(x: number): number {
  let n = x >>> 0;
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function computeFingerprintFromImage(
  img: CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number },
  sku = '',
  productId = ''
): VisualFingerprint {
  const natW = Number(img.naturalWidth || img.width || 64);
  const natH = Number(img.naturalHeight || img.height || 64);

  // 1) 16x16 full grid RGB
  const cFull = document.createElement('canvas');
  cFull.width = 16;
  cFull.height = 16;
  const ctxFull = cFull.getContext('2d')!;
  ctxFull.drawImage(img, 0, 0, 16, 16);
  const dFull = ctxFull.getImageData(0, 0, 16, 16).data;
  const fullRgb = new Uint8Array(16 * 16 * 3);
  for (let i = 0, j = 0; i < dFull.length; i += 4, j += 3) {
    fullRgb[j] = dFull[i];
    fullRgb[j + 1] = dFull[i + 1];
    fullRgb[j + 2] = dFull[i + 2];
  }

  // 2) 12x12 center box (15%..85% X, 15%..75% Y) focusing on product body away from corner stickers
  const cCenter = document.createElement('canvas');
  cCenter.width = 12;
  cCenter.height = 12;
  const ctxCenter = cCenter.getContext('2d')!;
  ctxCenter.drawImage(
    img,
    Math.floor(natW * 0.15),
    Math.floor(natH * 0.15),
    Math.max(16, Math.floor(natW * 0.7)),
    Math.max(16, Math.floor(natH * 0.6)),
    0,
    0,
    12,
    12
  );
  const dCenter = ctxCenter.getImageData(0, 0, 12, 12).data;
  const centerRgb = new Uint8Array(12 * 12 * 3);
  for (let i = 0, j = 0; i < dCenter.length; i += 4, j += 3) {
    centerRgb[j] = dCenter[i];
    centerRgb[j + 1] = dCenter[i + 1];
    centerRgb[j + 2] = dCenter[i + 2];
  }

  // 3) 9x8 greyscale 64-bit dHash (split into two 32-bit ints for JS safety)
  const cGray = document.createElement('canvas');
  cGray.width = 9;
  cGray.height = 8;
  const ctxGray = cGray.getContext('2d')!;
  ctxGray.drawImage(img, 0, 0, 9, 8);
  const dGray = ctxGray.getImageData(0, 0, 9, 8).data;
  const lum = new Float32Array(9 * 8);
  for (let i = 0; i < 9 * 8; i++) {
    lum[i] = dGray[i * 4] * 0.299 + dGray[i * 4 + 1] * 0.587 + dGray[i * 4 + 2] * 0.114;
  }

  let dhashLo = 0;
  let dhashHi = 0;
  let bit = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (lum[y * 9 + x] < lum[y * 9 + x + 1]) {
        if (bit < 32) dhashLo |= 1 << bit;
        else dhashHi |= 1 << (bit - 32);
      }
      bit++;
    }
  }

  return {
    sku,
    productId,
    dhashHi: dhashHi >>> 0,
    dhashLo: dhashLo >>> 0,
    centerRgb,
    fullRgb,
  };
}

export function compareFingerprints(a: VisualFingerprint, b: VisualFingerprint): number {
  const dist = popcount32(a.dhashLo ^ b.dhashLo) + popcount32(a.dhashHi ^ b.dhashHi);
  const hashSim = 1 - dist / 64;

  let centerDiff = 0;
  const cLen = Math.min(a.centerRgb.length, b.centerRgb.length);
  for (let i = 0; i < cLen; i++) {
    centerDiff += Math.abs(a.centerRgb[i] - b.centerRgb[i]);
  }
  const centerSim = cLen > 0 ? 1 - centerDiff / (cLen * 255) : 0;

  let fullDiff = 0;
  const fLen = Math.min(a.fullRgb.length, b.fullRgb.length);
  for (let i = 0; i < fLen; i++) {
    fullDiff += Math.abs(a.fullRgb[i] - b.fullRgb[i]);
  }
  const fullSim = fLen > 0 ? 1 - fullDiff / (fLen * 255) : 0;

  return 0.45 * hashSim + 0.35 * centerSim + 0.2 * fullSim;
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar imagen: ${src}`));
    img.src = src;
  });
}

export async function indexCatalogVisualFingerprints(
  products: Product[],
  resolveUrl: (p: Product) => string,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, VisualFingerprint>> {
  const results = new Map<string, VisualFingerprint>();
  const batchSize = 10;

  for (let i = 0; i < products.length; i += batchSize) {
    const chunk = products.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (prod) => {
        const url = resolveUrl(prod);
        const cacheKey = `${prod.id}|${url}`;
        const cached = fpCache.get(cacheKey);
        if (cached) {
          results.set(prod.id, cached);
          return;
        }
        try {
          const img = await loadImageElement(url);
          const fp = computeFingerprintFromImage(img, prod.sku, prod.id);
          fpCache.set(cacheKey, fp);
          results.set(prod.id, fp);
        } catch {
          // skip unreadable image silently
        }
      })
    );
    onProgress?.(Math.min(products.length, i + chunk.length), products.length);
  }

  return results;
}

export function rankCatalogMatches(
  queryFp: VisualFingerprint,
  products: Product[],
  catalogFps: Map<string, VisualFingerprint>,
  limit = 3
): Array<{ product: Product; score: number }> {
  const ranked: Array<{ product: Product; score: number }> = [];
  for (const prod of products) {
    const fp = catalogFps.get(prod.id);
    if (!fp) continue;
    ranked.push({
      product: prod,
      score: compareFingerprints(queryFp, fp),
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

export function generateNextSku(products: Product[], usedSkus: Set<string> = new Set()): string {
  let maxNum = 260;
  const check = (sku: string) => {
    const m = /^YOL-(\d+)$/i.exec(sku.trim());
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  };
  products.forEach((p) => check(p.sku));
  usedSkus.forEach((s) => check(s));
  let candidateNum = maxNum + 1;
  while (usedSkus.has(`YOL-${String(candidateNum).padStart(3, '0')}`)) {
    candidateNum++;
  }
  return `YOL-${String(candidateNum).padStart(3, '0')}`;
}

export function normalizeSizeTokens(raw: Array<string | number> | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  const clean = new Set<string>();
  for (const item of raw) {
    const s = String(item || '')
      .trim()
      .toUpperCase();
    if (!s) continue;
    // Handle merged tokens like "38.39" or "38,39"
    for (const part of s.split(/[,.\s/;|]+/)) {
      const p = part.trim();
      if (!p) continue;
      if (/^(?:2\d|3\d|4\d|50)$/.test(p) || /^(XS|S|M|L|XL|XXL|2XL|3XL|ÚNICA)$/i.test(p)) {
        clean.add(p === 'ÚNICA' ? 'Única' : p);
      }
    }
  }
  return sortSizesList(Array.from(clean));
}

export function parsePriceFromAny(
  rawPrice: number | string | null | undefined,
  rawCurrency?: string
): { price: number | null; currency: Currency } {
  const curStr = String(rawCurrency || '').toUpperCase();
  let currency: Currency = curStr.includes('USD') || curStr.includes('$') ? 'USD' : 'CUP';

  if (rawPrice === null || rawPrice === undefined || rawPrice === '') {
    return { price: null, currency };
  }
  if (typeof rawPrice === 'number' && Number.isFinite(rawPrice) && rawPrice > 0) {
    if (rawPrice < 300 && !curStr.includes('CUP')) currency = 'USD';
    return { price: rawPrice, currency };
  }

  const txt = String(rawPrice).trim().toLowerCase();
  if (txt.includes('usd') || txt.includes('$')) currency = 'USD';

  const milMatch = /(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/i.exec(txt);
  if (milMatch) {
    const val = parseFloat(milMatch[1].replace(',', '.'));
    if (Number.isFinite(val) && val > 0) {
      return { price: Math.round(val * 1000), currency: 'CUP' };
    }
  }

  const cleanedNum = txt
    .replace(/[^\d.,]/g, '')
    .replace(/\.(\d{3})(?!\d)/g, '$1')
    .replace(',', '.');
  const n = parseFloat(cleanedNum);
  if (!Number.isFinite(n) || n <= 0) return { price: null, currency };
  if (n < 300 && !txt.includes('cup')) currency = 'USD';
  return { price: n, currency };
}

export function extractJsonObjectFromAiText(raw: string): ParsedVisionExtraction | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as ParsedVisionExtraction;
  } catch {
    return null;
  }
}

export async function fileToResizedBase64Jpeg(file: File, maxDim = 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || maxDim) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || maxDim) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return dataUrl.split(',')[1] || '';
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function remoteUrlToBase64Jpeg(url: string, maxDim = 720): Promise<string> {
  const img = await loadImageElement(url);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(1, Math.round((img.naturalWidth || maxDim) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || maxDim) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return dataUrl.split(',')[1] || '';
}

function buildVisionPrompt(candidate: Product | null): string {
  if (candidate) {
    return `Eres el asistente de inventario de la tienda Yole Shop (calzado 3A/G5 y moda en Cuba).
Tienes la FOTO NUEVA del grupo de WhatsApp (imagen 1) y la FOTO ACTUAL del candidato del catálogo "${candidate.title}" (${candidate.sku}, tallas anteriores: ${candidate.sizes.join(', ')}, precio anterior: ${candidate.price ?? 'sin definir'} ${candidate.currency}) como imagen 2.

INSTRUCCIONES CRÍTICAS:
1. Compara si la imagen 1 muestra EL MISMO modelo y color de zapato/prenda que la imagen 2 (ignorando stickers de precio, textos rojos, tachones con X o fondo diferente).
2. Lee el texto sobre la imagen 1:
   - Precio ("30mil" = 30000 CUP, "35mil" = 35000 CUP, "$85" o "85 usd" = 85 USD).
   - Tallas AÚN DISPONIBLES (números como 36..45 o tallas XS..XL que NO están tachadas).
   - Tallas TACHADAS / VENDIDAS (números tapados con una X negra/roja, raya encima, o que estaban antes en [${candidate.sizes.join(', ')}] pero fueron borrados/tachados con X).
3. Devuelve ÚNICAMENTE JSON válido sin explicación extra:
{
  "same_product": true,
  "price": 30000,
  "currency": "CUP",
  "available_sizes": ["38", "39", "40", "41", "42"],
  "crossed_out_sizes": ["43"],
  "title": "${candidate.title}",
  "brand": "${candidate.brand}",
  "quality": "${candidate.quality}",
  "department": "${candidate.department}",
  "note": "breve nota de lo detectado"
}`;
  }

  return `Eres el asistente de inventario de la tienda Yole Shop (calzado 3A/G5 y moda en Cuba).
Analiza esta FOTO NUEVA de producto del grupo de WhatsApp:
1. Extrae precio ("30mil" = 30000 CUP, "35mil" = 35000 CUP, "$85" = 85 USD).
2. Extrae tallas AÚN DISPONIBLES (números o letras no tachados) y tallas TACHADAS con X o raya.
3. Identifica marca, modelo descriptivo en español con color, calidad ("3A", "G5" o "Importado") y departamento ("calzado", "moda_shein", "hombre", "accesorios", "movilidad" o "solares").
4. Devuelve ÚNICAMENTE JSON válido:
{
  "same_product": false,
  "price": 30000,
  "currency": "CUP",
  "available_sizes": ["39", "40", "41"],
  "crossed_out_sizes": [],
  "title": "Nike Dunk Low Blanco & Negro",
  "brand": "Nike",
  "quality": "3A",
  "department": "calzado",
  "note": "modelo nuevo detectado"
}`;
}

export async function analyzeWithFreeAiVision(
  cfg: PhotoSyncAiConfig,
  newFileBase64: string,
  candidateProduct: Product | null,
  candidateImageUrl?: string
): Promise<ParsedVisionExtraction | null> {
  if (cfg.provider === 'local_only' || !cfg.apiKey.trim()) return null;

  const prompt = buildVisionPrompt(candidateProduct);
  let candidateBase64 = '';
  if (candidateProduct && candidateImageUrl) {
    try {
      candidateBase64 = await remoteUrlToBase64Jpeg(candidateImageUrl);
    } catch {
      candidateBase64 = '';
    }
  }

  if (cfg.provider === 'gemini_free') {
    const parts: Array<Record<string, unknown>> = [
      { text: prompt },
      { inline_data: { mime_type: 'image/jpeg', data: newFileBase64 } },
    ];
    if (candidateBase64) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: candidateBase64 } });
    }
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(cfg.apiKey.trim())}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`Gemini error (${res.status}): ${errTxt.slice(0, 140)}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return extractJsonObjectFromAiText(text);
  }

  if (cfg.provider === 'groq_free') {
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${newFileBase64}` } },
    ];
    if (candidateBase64) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${candidateBase64}` },
      });
    }
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        temperature: 0.1,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`Groq error (${res.status}): ${errTxt.slice(0, 140)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content || '';
    return extractJsonObjectFromAiText(text);
  }

  return null;
}

function sameSizeSets(a: string[], b: string[]): boolean {
  const sa = sortSizesList(a);
  const sb = sortSizesList(b);
  return sa.length === sb.length && sa.every((v, idx) => v === sb[idx]);
}

export function classifyAnalysisOutcome(params: {
  matchedProduct: Product | null;
  matchScore: number;
  extracted: ParsedVisionExtraction | null;
  defaultCategoryId: string;
  suggestedSku: string;
  fileName: string;
}): Omit<AnalyzedPhotoItem, 'id' | 'file' | 'previewUrl' | 'candidates'> {
  const { matchedProduct, matchScore, extracted, defaultCategoryId, suggestedSku, fileName } =
    params;

  // If Vision AI explicitly said it is NOT the same product, treat as new product!
  const isConfirmedExisting =
    matchedProduct !== null &&
    (extracted ? extracted.same_product !== false : matchScore >= 0.76);

  if (isConfirmedExisting && matchedProduct) {
    const prevAvail = matchedProduct.sizes.filter(
      (s) => !(matchedProduct.sold_out_sizes || []).includes(s)
    );
    const prevSoldOut = Array.isArray(matchedProduct.sold_out_sizes)
      ? matchedProduct.sold_out_sizes
      : [];

    let nextAvail = prevAvail;
    let nextSoldOut = prevSoldOut;

    if (extracted) {
      const extAvail = normalizeSizeTokens(extracted.available_sizes);
      const extCrossed = normalizeSizeTokens(extracted.crossed_out_sizes);

      if (extAvail.length > 0 || extCrossed.length > 0) {
        const availSet = new Set(extAvail);
        // Any previously available size that is now missing from extAvail OR listed in extCrossed becomes sold out!
        const inferredCrossed = matchedProduct.sizes.filter((s) => !availSet.has(s));
        const allCrossed = sortSizesList(Array.from(new Set([...extCrossed, ...inferredCrossed])));
        nextAvail = extAvail;
        nextSoldOut = allCrossed.filter((s) => !availSet.has(s));
      }
    }

    const parsedPrice = extracted
      ? parsePriceFromAny(extracted.price, extracted.currency)
      : { price: matchedProduct.price, currency: matchedProduct.currency };
    const nextPrice = parsedPrice.price ?? matchedProduct.price;
    const nextCurrency = parsedPrice.price !== null ? parsedPrice.currency : matchedProduct.currency;

    const sizesChanged =
      !sameSizeSets(nextAvail, prevAvail) || !sameSizeSets(nextSoldOut, prevSoldOut);
    const priceChanged =
      nextPrice !== matchedProduct.price || nextCurrency !== matchedProduct.currency;

    const allGone = nextAvail.length === 0 && (nextSoldOut.length > 0 || matchedProduct.sizes.length > 0);
    let bucket: SyncBucket = 'unchanged';
    if (allGone && sizesChanged) bucket = 'sold_out';
    else if (sizesChanged || priceChanged) bucket = 'update';
    else if (!extracted) {
      // Local-only mode: let user review matched candidate cleanly if match was found
      bucket = 'update';
    }

    return {
      matchedProduct,
      matchScore,
      bucket,
      selected: bucket !== 'unchanged',
      replacePhoto: false,
      suggestedSku: matchedProduct.sku,
      title: matchedProduct.title,
      brand: matchedProduct.brand,
      quality: matchedProduct.quality,
      department: matchedProduct.department,
      categoryId: matchedProduct.category_id || defaultCategoryId,
      price: nextPrice,
      currency: nextCurrency,
      availableSizes: nextAvail,
      soldOutSizes: nextSoldOut,
      aiNote:
        extracted?.note ||
        (extracted
          ? sizesChanged || priceChanged
            ? 'Cambio detectado en foto nueva'
            : 'Sin cambios respecto al catálogo'
          : `Coincidencia visual ${(matchScore * 100).toFixed(0)}% · revisa o toca tallas tachadas`),
      status: allGone ? 'sold_out' : matchedProduct.status === 'sold_out' && nextAvail.length > 0 ? 'active' : matchedProduct.status,
    };
  }

  // New model!
  const parsedPrice = extracted
    ? parsePriceFromAny(extracted.price, extracted.currency)
    : { price: null, currency: 'CUP' as Currency };
  const avail = extracted ? normalizeSizeTokens(extracted.available_sizes) : [];
  const crossed = extracted ? normalizeSizeTokens(extracted.crossed_out_sizes) : [];
  const dept: Department =
    extracted?.department === 'moda_shein' ||
    extracted?.department === 'hombre' ||
    extracted?.department === 'accesorios' ||
    extracted?.department === 'movilidad' ||
    extracted?.department === 'solares'
      ? extracted.department
      : 'calzado';

  const cleanFileNameTitle = fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\bWhatsApp Image.*$/i, '')
    .trim();

  return {
    matchedProduct: null,
    matchScore,
    bucket: 'new_product',
    selected: true,
    replacePhoto: true,
    suggestedSku,
    title: extracted?.title?.trim() || cleanFileNameTitle || `Modelo nuevo ${suggestedSku}`,
    brand: extracted?.brand?.trim() || 'Importado',
    quality: extracted?.quality?.trim() || '3A',
    department: dept,
    categoryId: defaultCategoryId,
    price: parsedPrice.price,
    currency: parsedPrice.currency,
    availableSizes: avail,
    soldOutSizes: crossed,
    aiNote: extracted?.note || 'No coincide con productos existentes — listo para crear',
    status: 'active',
  };
}
