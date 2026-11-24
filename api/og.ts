import type { IncomingMessage, ServerResponse } from 'node:http';
import sharp from 'sharp';

const SUPABASE_URL = 'https://lroyrrgcjjtijwutykzm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb3lycmdjamp0aWp3dXR5a3ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NDgxNzAsImV4cCI6MjExMTAyNDE3MH0.tX3sQLLbY0myA3-9UUxfCtgReCn3k32e870fTT7Q0uE';

const ALLOWED_IMAGE_HOST = 'lroyrrgcjjtijwutykzm.supabase.co';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const reqUrl = new URL(req.url || '/', 'https://yole-shop.vercel.app');
    const skuParam = (reqUrl.searchParams.get('sku') || '').trim().toUpperCase();
    let imageUrl = (reqUrl.searchParams.get('url') || '').trim();

    if (!imageUrl && skuParam) {
      const pRes = await fetch(
        `${SUPABASE_URL}/rest/v1/products?sku=eq.${encodeURIComponent(skuParam)}&select=image_url&limit=1`,
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
    }

    if (!imageUrl) {
      res.writeHead(302, { Location: 'https://yoleshop.ddns.net/og-default.jpg' });
      res.end();
      return;
    }

    const parsed = new URL(imageUrl);
    if (parsed.hostname !== ALLOWED_IMAGE_HOST) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid image host');
      return;
    }

    const imgRes = await fetch(parsed.toString());
    if (!imgRes.ok) {
      res.writeHead(302, { Location: 'https://yoleshop.ddns.net/og-default.jpg' });
      res.end();
      return;
    }

    const inputBuf = Buffer.from(await imgRes.arrayBuffer());
    const jpegBuf = await sharp(inputBuf)
      .resize(800, 800, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();

    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(jpegBuf.byteLength),
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(jpegBuf);
  } catch {
    res.writeHead(302, { Location: 'https://yoleshop.ddns.net/og-default.jpg' });
    res.end();
  }
}
