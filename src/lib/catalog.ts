import type {
  Category,
  Currency,
  Department,
  Order,
  OrderStatus,
  PricePreset,
  Product,
  ProductStatus,
  StoreSettings,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { STORAGE_BUCKET, SUPABASE_URL, supabase } from './supabase';
import { priceInCup, priceInUsd } from './pricing';

export type SortMode = 'featured' | 'price_asc' | 'price_desc' | 'newest';

export type DepartmentFilter = Department | 'all' | 'shein_all';

export type PriceRangeFilter = 'all' | 'under15' | '15to30' | 'over30';

export interface CatalogFilters {
  department: DepartmentFilter;
  categoryId: string;
  size: string;
  search: string;
  onlyPriced: boolean;
  priceRange?: PriceRangeFilter;
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

export function normalizeSearchText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function getAvailableSizes(product: Pick<Product, 'sizes' | 'sold_out_sizes'>): string[] {
  const soldOut = new Set(product.sold_out_sizes || []);
  return product.sizes.filter((s) => s && !soldOut.has(s));
}

export function collectAvailableSizes(products: Product[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    if (p.status === 'hidden') continue;
    for (const s of getAvailableSizes(p)) {
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
  const qNorm = normalizeSearchText(filters.search);
  const tokens = qNorm ? qNorm.split(' ').filter(Boolean) : [];

  const filtered = products.filter((p) => {
    if (p.status === 'hidden') return false;
    if (!filters.includeSoldOut && p.status === 'sold_out') return false;
    if (filters.department === 'shein_all') {
      if (p.department !== 'moda_shein' && p.department !== 'hombre') return false;
    } else if (filters.department !== 'all' && p.department !== filters.department) {
      return false;
    }
    if (filters.categoryId !== 'all' && p.category_id !== filters.categoryId) return false;
    if (filters.size !== 'all' && !getAvailableSizes(p).includes(filters.size)) return false;
    if (filters.onlyPriced && (p.price === null || !Number.isFinite(p.price))) return false;
    if (filters.priceRange && filters.priceRange !== 'all') {
      const usd = priceInUsd(p.price, p.currency, usdToCupRate);
      if (usd === null) return false;
      if (filters.priceRange === 'under15' && usd > 15) return false;
      if (filters.priceRange === '15to30' && (usd <= 15 || usd > 30)) return false;
      if (filters.priceRange === 'over30' && usd <= 30) return false;
    }
    if (tokens.length > 0) {
      const hay = normalizeSearchText(
        `${p.sku} ${p.title} ${p.brand} ${p.quality} ${p.fit_note} ${getAvailableSizes(p).join(' ')}`
      );
      if (!tokens.every((t) => hay.includes(t))) return false;
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

export interface CachedStorePayload {
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
  pricePresets?: PricePreset[];
  updatedAt?: number;
}

const CATALOG_CACHE_KEY = 'yole_shop_catalog_cache_v1';

export function readCachedStoreData(): CachedStorePayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedStorePayload;
    if (!parsed || !Array.isArray(parsed.products) || parsed.products.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedStoreData(payload: CachedStorePayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify({ ...payload, updatedAt: Date.now() })
    );
  } catch {
    // ignore storage quota errors
  }
}

export async function fetchStoreData(): Promise<{
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
  pricePresets?: PricePreset[];
}> {
  const [settingsRes, categoriesRes, productsRes, presetsRes] = await Promise.all([
    supabase.from('store_settings').select('*').eq('id', 'default').maybeSingle(),
    supabase.from('categories').select('*').order('sort_order', { ascending: true }),
    supabase
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('sku', { ascending: true }),
    supabase
      .from('price_presets')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
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
    sold_out_sizes: Array.isArray(row.sold_out_sizes) ? row.sold_out_sizes : [],
    extra_images: Array.isArray(row.extra_images) ? row.extra_images : [],
  }));

  const pricePresets: PricePreset[] = (presetsRes.data || []).map((row) => ({
    ...row,
    cost_price: row.cost_price !== null && row.cost_price !== undefined ? Number(row.cost_price) : null,
    price: Number(row.price) || 0,
  }));

  return {
    settings,
    categories: (categoriesRes.data || []) as Category[],
    products,
    pricePresets,
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
      sold_out_sizes: Array.isArray(data.sold_out_sizes) ? data.sold_out_sizes : [],
      extra_images: Array.isArray(data.extra_images) ? data.extra_images : [],
    };
  }
  const { data, error } = await supabase.from('products').insert(payload).select('*').single();
  if (error) throw error;
  return {
    ...data,
    cost_price: data.cost_price !== null ? Number(data.cost_price) : null,
    price: data.price !== null ? Number(data.price) : null,
    sizes: Array.isArray(data.sizes) ? data.sizes : [],
    sold_out_sizes: Array.isArray(data.sold_out_sizes) ? data.sold_out_sizes : [],
    extra_images: Array.isArray(data.extra_images) ? data.extra_images : [],
  };
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export function makePresetSlug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `grupo-${Date.now()}`;
}

export async function savePricePreset(
  preset: Omit<PricePreset, 'created_at' | 'updated_at'>
): Promise<PricePreset> {
  const { data, error } = await supabase
    .from('price_presets')
    .upsert(preset, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return {
    ...data,
    cost_price: data.cost_price !== null ? Number(data.cost_price) : null,
    price: Number(data.price) || 0,
  };
}

export async function deletePricePreset(id: string): Promise<void> {
  const { error } = await supabase.from('price_presets').delete().eq('id', id);
  if (error) throw error;
}

export async function applyPresetToLinkedProducts(
  preset: Pick<PricePreset, 'id' | 'currency' | 'cost_price' | 'price'>
): Promise<number> {
  const { data, error } = await supabase
    .from('products')
    .update({
      currency: preset.currency,
      cost_price: preset.cost_price,
      price: preset.price,
    })
    .eq('price_preset_id', preset.id)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

export async function bulkUpdateProducts(
  ids: string[],
  patch: Partial<{
    price: number | null;
    cost_price: number | null;
    currency: Currency;
    price_preset_id: string | null;
    status: ProductStatus;
    department: Department;
    category_id: string;
  }>
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('products').update(patch).in('id', ids);
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

const FAVORITES_KEY = 'yole_shop_favorites_v1';
const RECENT_KEY = 'yole_shop_recent_v1';
const CUSTOMER_PROFILE_KEY = 'yole_shop_customer_profile_v1';

export interface SavedCustomerProfile {
  customerName: string;
  customerPhone: string;
  deliveryType: 'domicilio' | 'recogida';
  deliveryAddress: string;
  paymentMethod: 'efectivo' | 'transferencia' | 'usd';
  deliveryTime: string;
}

export function readFavoriteSkus(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeFavoriteSkus(skus: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(skus));
  } catch {
    // ignore
  }
}

export function readRecentSkus(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecentSku(sku: string): string[] {
  const next = [sku, ...readRecentSkus().filter((s) => s !== sku)].slice(0, 12);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}

export function readCustomerProfile(): SavedCustomerProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CUSTOMER_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as SavedCustomerProfile) : null;
  } catch {
    return null;
  }
}

export function writeCustomerProfile(profile: SavedCustomerProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export function clearCustomerProfile(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CUSTOMER_PROFILE_KEY);
  } catch {
    // ignore
  }
}

export type ThemeMode = 'light' | 'dark';
const THEME_KEY = 'yole_shop_theme_v1';

export function readThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function writeThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    // ignore
  }
}
