interface PagesContext {
  request: Request;
  env: {
    ASSETS: { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
  };
  next: () => Promise<Response>;
}

const SUPABASE_URL = 'https://lroyrrgcjjtijwutykzm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb3lycmdjamp0aWp3dXR5a3ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NDgxNzAsImV4cCI6MjExMTAyNDE3MH0.tX3sQLLbY0myA3-9UUxfCtgReCn3k32e870fTT7Q0uE';

interface ProductRow {
  sku: string;
  title: string;
  brand: string;
  quality: string;
  currency: 'CUP' | 'USD';
  price: number | null;
  sizes: string[];
  sold_out_sizes?: string[];
  fit_note?: string;
}

function extractSku(url: URL): string {
  const fromParam = (url.searchParams.get('sku') || '').trim();
  if (fromParam) return fromParam.toUpperCase();
  const match = /^\/p\/([A-Za-z0-9_-]+)\/?$/i.exec(url.pathname);
  return match ? match[1].toUpperCase() : '';
}

function formatPriceText(prod: ProductRow, usdRate: number): string {
  if (prod.price === null || !Number.isFinite(Number(prod.price))) {
    return 'Precio por consultar';
  }
  const num = Number(prod.price);
  const rate = usdRate > 0 ? usdRate : 980;
  if (prod.currency === 'USD') {
    const cup = Math.round(num * rate).toLocaleString('es-ES');
    const usd = Number.isInteger(num) ? String(num) : num.toFixed(2);
    return `$${usd} USD (${cup} CUP)`;
  }
  const cup = Math.round(num).toLocaleString('es-ES');
  const usd = Math.round((num / rate) * 100) / 100;
  return `${cup} CUP (≈ $${usd} USD)`;
}

function escapeMeta(val: string): string {
  return val.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const onRequest = async (context: PagesContext) => {
  const reqUrl = new URL(context.request.url);
  const sku = extractSku(reqUrl);

  const isProductRoute = /^\/p\/[A-Za-z0-9_-]+\/?$/i.test(reqUrl.pathname);

  if (!sku) {
    return context.next();
  }

  // Always serve clean SPA HTML on /p/SKU routes, or normal downstream on /?sku=SKU
  const baseResponse = isProductRoute
    ? await context.env.ASSETS.fetch(new URL('/index.html', reqUrl))
    : await context.next();

  const ct = baseResponse.headers.get('content-type') || '';
  if (!ct.includes('text/html')) {
    return baseResponse;
  }

  let prod: ProductRow | null = null;
  let usdRate = 980;

  try {
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };
    const [pRes, sRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/products?sku=eq.${encodeURIComponent(sku)}&select=sku,title,brand,quality,currency,price,sizes,sold_out_sizes,fit_note&limit=1`,
        { headers }
      ),
      fetch(`${SUPABASE_URL}/rest/v1/store_settings?id=eq.default&select=usd_to_cup_rate&limit=1`, {
        headers,
      }),
    ]);

    if (pRes.ok) {
      const rows = (await pRes.json()) as ProductRow[];
      if (rows[0]?.sku) prod = rows[0];
    }
    if (sRes.ok) {
      const sRows = (await sRes.json()) as Array<{ usd_to_cup_rate?: number }>;
      if (sRows[0]?.usd_to_cup_rate) usdRate = Number(sRows[0].usd_to_cup_rate);
    }
  } catch {
    return baseResponse;
  }

  if (!prod) {
    return baseResponse;
  }

  const soldOut = new Set(Array.isArray(prod.sold_out_sizes) ? prod.sold_out_sizes : []);
  const availSizes = (Array.isArray(prod.sizes) ? prod.sizes : []).filter((s) => s && !soldOut.has(s));
  const priceLabel = formatPriceText(prod, usdRate);

  const ogTitle = `${prod.title} · ${priceLabel}`;
  const descParts = [
    prod.quality ? `Calidad ${prod.quality}` : prod.brand || 'Yole Shop',
    availSizes.length > 0 ? `Tallas: ${availSizes.join(', ')}` : 'Disponible en Yole Shop',
    prod.fit_note ? prod.fit_note : 'Pídelo directo por WhatsApp en Santa Clara',
  ];
  const ogDesc = descParts.filter(Boolean).join(' · ');
  const ogImage = `${reqUrl.origin}/og-image?sku=${encodeURIComponent(prod.sku)}`;
  const canonicalUrl = `${reqUrl.origin}/p/${encodeURIComponent(prod.sku)}`;

  const HTMLRewriterCtor = (globalThis as unknown as {
    HTMLRewriter: new () => {
      on: (sel: string, handler: unknown) => unknown;
      transform: (res: Response) => Response;
    };
  }).HTMLRewriter;

  if (!HTMLRewriterCtor) {
    return baseResponse;
  }

  const rewriter = new HTMLRewriterCtor();
  rewriter.on('title', {
    element(el: { setInnerContent: (s: string) => void }) {
      el.setInnerContent(escapeMeta(`${prod!.title} (${prod!.sku}) · Yole Shop`));
    },
  });
  rewriter.on('meta', {
    element(el: {
      getAttribute: (n: string) => string | null;
      setAttribute: (n: string, v: string) => void;
    }) {
      const prop = el.getAttribute('property') || '';
      const name = el.getAttribute('name') || '';

      if (name === 'description') el.setAttribute('content', ogDesc);
      else if (prop === 'og:title' || name === 'twitter:title') el.setAttribute('content', ogTitle);
      else if (prop === 'og:description' || name === 'twitter:description')
        el.setAttribute('content', ogDesc);
      else if (
        prop === 'og:image' ||
        prop === 'og:image:secure_url' ||
        name === 'twitter:image'
      )
        el.setAttribute('content', ogImage);
      else if (prop === 'og:image:type') el.setAttribute('content', 'image/jpeg');
      else if (prop === 'og:image:width' || prop === 'og:image:height')
        el.setAttribute('content', '800');
      else if (prop === 'og:url') el.setAttribute('content', canonicalUrl);
    },
  });

  const transformed = rewriter.transform(baseResponse);
  const newHeaders = new Headers(transformed.headers);
  newHeaders.set('Cache-Control', 'no-cache, must-revalidate');
  return new Response(transformed.body, {
    status: 200,
    headers: newHeaders,
  });
};
