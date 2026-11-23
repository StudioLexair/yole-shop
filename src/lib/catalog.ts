import type {
  Category,
  Department,
  Order,
  OrderStatus,
  Product,
  StoreSettings,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { STORAGE_BUCKET, SUPABASE_URL, supabase } from './supabase';
import { priceInCup } from './pricing';

export type SortMode = 'featured' | 'price_asc' | 'price_desc' | 'newest';

export interface CatalogFilters {
  department: Department | 'all';
  categoryId: string;
  size: string;
  search: string;
  onlyPriced: boolean;
  includeSoldOut: boolean;
  sort: SortMode;
}

export function sortSizesList(sizes: string[]): string[] {
  const apparelOrder = ['XS', '13-16 años', 'S', 'M', 'L', 'XL', 'XXL', 'Única', 'Consultar'];
  return [...sizes].sort((a, b) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    const aIsNum = !Number.isNaN(na) && /^\d+(\.\d+)?$/.test(a.trim());
    const bIsNum = !Number.isNaN(nb) && /^\d+(\.\d+)?$/.test(b.trim());
    if (aIsNum && bIsNum) return na - nb;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    const ia = apparelOrder.indexOf(a);
    const ib = apparelOrder.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

export function collectAvailableSizes(products: Product[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    if (p.status === 'hidden') continue;
    for (const s of p.sizes) {
      if (s && s !== 'Consultar') set.add(s);
    }
  }
  return sortSizesList(Array.from(set));
}

export function filterProducts(
  products: Product[],
  filters: CatalogFilters,
  usdToCupRate: number
): Product[] {
  const q = filters.search.trim().toLowerCase();

  const filtered = products.filter((p) => {
    if (p.status === 'hidden') return false;
    if (!filters.includeSoldOut && p.status === 'sold_out') return false;
    if (filters.department !== 'all' && p.department !== filters.department) return false;
    if (filters.categoryId !== 'all' && p.category_id !== filters.categoryId) return false;
    if (filters.size !== 'all' && !p.sizes.includes(filters.size)) return false;
    if (filters.onlyPriced && (p.price === null || !Number.isFinite(p.price))) return false;
    if (q) {
      const hay = `${p.sku} ${p.title} ${p.brand} ${p.quality} ${p.fit_note} ${p.sizes.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (a.status === 'sold_out' && b.status !== 'sold_out') return 1;
    if (b.status === 'sold_out' && a.status !== 'sold_out') return -1;

    if (filters.sort === 'featured') {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.sort_order - b.sort_order;
    }
    if (filters.sort === 'price_asc' || filters.sort === 'price_desc') {
      const pa = priceInCup(a.price, a.currency, usdToCupRate);
      const pb = priceInCup(b.price, b.currency, usdToCupRate);
      if (pa === null && pb === null) return a.sort_order - b.sort_order;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return filters.sort === 'price_asc' ? pa - pb : pb - pa;
    }
    if (filters.sort === 'newest') {
      return (b.created_at || '').localeCompare(a.created_at || '') || b.sort_order - a.sort_order;
    }
    return a.sort_order - b.sort_order;
  });

  return sorted;
}

export async function fetchStoreData(): Promise<{
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
}> {
  const [settingsRes, categoriesRes, productsRes] = await Promise.all([
    supabase.from('store_settings').select('*').eq('id', 'default').maybeSingle(),
    supabase.from('categories').select('*').order('sort_order', { ascending: true }),
    supabase
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('sku', { ascending: true }),
  ]);

  if (settingsRes.error) throw settingsRes.error;
  if (categoriesRes.error) throw categoriesRes.error;
  if (productsRes.error) throw productsRes.error;

  const rawSettings = settingsRes.data;
  const settings: StoreSettings = rawSettings
    ? {
        ...DEFAULT_SETTINGS,
        ...rawSettings,
        usd_to_cup_rate: Number(rawSettings.usd_to_cup_rate) || DEFAULT_SETTINGS.usd_to_cup_rate,
        delivery_fee_cup: Number(rawSettings.delivery_fee_cup) || 0,
        transfer_surcharge_pct: Number(rawSettings.transfer_surcharge_pct) || 0,
        shein_under_20_markup: Number(rawSettings.shein_under_20_markup) || 2,
        shein_even_20_plus_markup: Number(rawSettings.shein_even_20_plus_markup) || 2,
        shein_odd_20_plus_markup: Number(rawSettings.shein_odd_20_plus_markup) || 3,
      }
    : DEFAULT_SETTINGS;

  const products: Product[] = (productsRes.data || []).map((row) => ({
    ...row,
    cost_price: row.cost_price !== null && row.cost_price !== undefined ? Number(row.cost_price) : null,
    price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
  }));

  return {
    settings,
    categories: (categoriesRes.data || []) as Category[],
    products,
  };
}

export async function uploadProductWebP(
  sku: string,
  blob: Blob
): Promise<{ imageUrl: string; imagePath: string }> {
  const cleanSku = sku.replace(/[^a-zA-Z0-9_-]/g, '') || `YOL-${Date.now()}`;
  const path = `catalog/${cleanSku}-${Date.now()}.webp`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    cacheControl: 'public, max-age=31536000, immutable',
    upsert: true,
  });
  if (error) throw error;
  const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  return { imageUrl, imagePath: path };
}

export async function saveProduct(
  payload: Omit<Product, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<Product> {
  if (payload.id) {
    const { id, ...rest } = payload;
    const { data, error } = await supabase
      .from('products')
      .update(rest)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return {
      ...data,
      cost_price: data.cost_price !== null ? Number(data.cost_price) : null,
      price: data.price !== null ? Number(data.price) : null,
      sizes: Array.isArray(data.sizes) ? data.sizes : [],
    };
  }
  const { data, error } = await supabase.from('products').insert(payload).select('*').single();
  if (error) throw error;
  return {
    ...data,
    cost_price: data.cost_price !== null ? Number(data.cost_price) : null,
    price: data.price !== null ? Number(data.price) : null,
    sizes: Array.isArray(data.sizes) ? data.sizes : [],
  };
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export async function saveStoreSettings(settings: StoreSettings): Promise<StoreSettings> {
  const { error } = await supabase
    .from('store_settings')
    .upsert({ ...settings, id: 'default' }, { onConflict: 'id' });
  if (error) throw error;
  return settings;
}

export async function submitPublicOrder(order: Omit<Order, 'id' | 'created_at' | 'status'>): Promise<void> {
  const { error } = await supabase.from('orders').insert({
    ...order,
    status: 'nuevo',
  });
  if (error) throw error;
}

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map((o) => ({
    ...o,
    subtotal_cup: Number(o.subtotal_cup) || 0,
    subtotal_usd: Number(o.subtotal_usd) || 0,
    delivery_fee_cup: Number(o.delivery_fee_cup) || 0,
  })) as Order[];
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}
