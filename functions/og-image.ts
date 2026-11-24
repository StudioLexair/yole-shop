interface PagesEnv {
  ASSETS: { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
}

const SUPABASE_URL = 'https://lroyrrgcjjtijwutykzm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb3lycmdjamp0aWp3dXR5a3ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NDgxNzAsImV4cCI6MjExMTAyNDE3MH0.tX3sQLLbY0myA3-9UUxfCtgReCn3k32e870fTT7Q0uE';

export const onRequestGet = async (context: { request: Request; env: PagesEnv }) => {
  const reqUrl = new URL(context.request.url);
  const sku = (reqUrl.searchParams.get('sku') || '').trim().toUpperCase();

  let imageUrl = '';
  if (sku) {
    try {
      const pRes = await fetch(
        `${SUPABASE_URL}/rest/v1/products?sku=eq.${encodeURIComponent(sku)}&select=image_url&limit=1`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (pRes.ok) {
        const rows = (await pRes.json()) as Array<{ image_url?: string }>;
        if (rows[0]?.image_url) imageUrl = rows[0].image_url;
      }
    } catch {
      imageUrl = '';
    }
  }

  if (!imageUrl) {
    return context.env.ASSETS.fetch(new URL('/og-default.jpg', reqUrl));
  }

  const candidates = [
    `https://yole-shop.vercel.app/api/og?url=${encodeURIComponent(imageUrl)}`,
    `https://wsrv.nl/?url=${encodeURIComponent(imageUrl.replace(/^https?:\/\//, ''))}&w=800&h=800&fit=contain&cbg=ffffff&output=jpg&q=85`,
  ];

  for (const upstream of candidates) {
    try {
      const r = await fetch(upstream);
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (r.ok && ct.includes('image/jpeg')) {
        return new Response(r.body, {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch {
      // try next upstream
    }
  }

  return context.env.ASSETS.fetch(new URL('/og-default.jpg', reqUrl));
};
