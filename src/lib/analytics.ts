import type { StoreEvent, StoreEventType } from '../types';
import { supabase } from './supabase';

const dedupeMap = new Map<string, number>();

/**
 * Envía eventos ligeros a Supabase (sin bloquear UI ni saturar en un mismo minuto).
 */
export function trackStoreEvent(params: {
  event_type: StoreEventType;
  sku?: string;
  product_title?: string;
  query?: string;
}): void {
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return;
  try {
    const key = `${params.event_type}:${params.sku || ''}:${(params.query || '').toLowerCase()}`;
    const last = dedupeMap.get(key) || 0;
    if (Date.now() - last < 15000) return;
    dedupeMap.set(key, Date.now());

    void supabase
      .from('store_events')
      .insert({
        event_type: params.event_type,
        sku: (params.sku || '').slice(0, 40),
        product_title: (params.product_title || '').slice(0, 140),
        query: (params.query || '').slice(0, 120),
      })
      .then(() => undefined, () => undefined);
  } catch {
    // telemetry never disrupts storefront
  }
}

export interface ProductAnalyticsRow {
  sku: string;
  product_title: string;
  views: number;
  cart_adds: number;
  whatsapp_clicks: number;
}

export interface SearchMissRow {
  query: string;
  count: number;
  last_at: string;
}

export interface StoreAnalyticsSummary {
  totalViews: number;
  totalWhatsApp: number;
  totalCartAdds: number;
  totalEmptySearches: number;
  topProducts: ProductAnalyticsRow[];
  topEmptySearches: SearchMissRow[];
}

export async function fetchStoreAnalytics(days = 30): Promise<StoreAnalyticsSummary> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from('store_events')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1500);

  if (error) throw error;
  const rows = (data || []) as StoreEvent[];

  const prodMap = new Map<string, ProductAnalyticsRow>();
  const searchMap = new Map<string, SearchMissRow>();

  let totalViews = 0;
  let totalWhatsApp = 0;
  let totalCartAdds = 0;
  let totalEmptySearches = 0;

  for (const ev of rows) {
    if (ev.event_type === 'product_view') totalViews++;
    else if (ev.event_type === 'whatsapp_click') totalWhatsApp++;
    else if (ev.event_type === 'cart_add') totalCartAdds++;
    else if (ev.event_type === 'search_empty') totalEmptySearches++;

    if (
      (ev.event_type === 'product_view' ||
        ev.event_type === 'whatsapp_click' ||
        ev.event_type === 'cart_add') &&
      ev.sku
    ) {
      const cur = prodMap.get(ev.sku) || {
        sku: ev.sku,
        product_title: ev.product_title || ev.sku,
        views: 0,
        cart_adds: 0,
        whatsapp_clicks: 0,
      };
      if (ev.event_type === 'product_view') cur.views++;
      if (ev.event_type === 'whatsapp_click') cur.whatsapp_clicks++;
      if (ev.event_type === 'cart_add') cur.cart_adds++;
      if (!cur.product_title && ev.product_title) cur.product_title = ev.product_title;
      prodMap.set(ev.sku, cur);
    }

    if (ev.event_type === 'search_empty' && ev.query.trim()) {
      const qKey = ev.query.trim().toLowerCase();
      const curQ = searchMap.get(qKey) || {
        query: ev.query.trim(),
        count: 0,
        last_at: ev.created_at,
      };
      curQ.count++;
      searchMap.set(qKey, curQ);
    }
  }

  const topProducts = Array.from(prodMap.values())
    .sort(
      (a, b) =>
        b.views * 2 + b.whatsapp_clicks * 3 + b.cart_adds - (a.views * 2 + a.whatsapp_clicks * 3 + a.cart_adds)
    )
    .slice(0, 15);

  const topEmptySearches = Array.from(searchMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    totalViews,
    totalWhatsApp,
    totalCartAdds,
    totalEmptySearches,
    topProducts,
    topEmptySearches,
  };
}

export async function clearStoreAnalytics(): Promise<void> {
  const { error } = await supabase
    .from('store_events')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
}
