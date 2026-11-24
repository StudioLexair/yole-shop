export type Department = 'calzado' | 'moda_shein' | 'hombre' | 'accesorios' | 'movilidad' | 'solares';
export type Currency = 'CUP' | 'USD';
export type ProductStatus = 'active' | 'sold_out' | 'hidden';
export type DeliveryType = 'domicilio' | 'recogida';
export type PaymentMethod = 'efectivo' | 'transferencia' | 'usd';
export type PaymentChannelKey = 'efectivo_usd' | 'zelle' | 'usdt' | 'mlc' | 'eur' | 'cup';
export type OrderStatus = 'nuevo' | 'confirmado' | 'en_reparto' | 'entregado' | 'cancelado';

export interface PaymentChannelConfig {
  label: string;
  mode: 'pct' | 'rate';
  value: number;
}

export type PaymentRatesMap = Record<PaymentChannelKey, PaymentChannelConfig>;
export type CustomSynonymsMap = Record<string, string[]>;

export const DEFAULT_PAYMENT_RATES: PaymentRatesMap = {
  efectivo_usd: { label: 'Efectivo USD', mode: 'pct', value: 0 },
  zelle: { label: 'Zelle', mode: 'pct', value: 2 },
  usdt: { label: 'USDT / Cripto', mode: 'pct', value: 1 },
  mlc: { label: 'MLC', mode: 'pct', value: 15 },
  eur: { label: 'EUR (Euros)', mode: 'rate', value: 0.92 },
  cup: { label: 'CUP Efectivo', mode: 'rate', value: 980 },
};

export interface ResellerConfig {
  enabled: boolean;
  mode: 'usd' | 'pct';
  value: number;
  gestorName: string;
  hideYoleSku: boolean;
}

export interface AlertSubscriber {
  id: string;
  contact: string;
  topics: string[];
  department: string;
  push_supported: boolean;
  created_at: string;
}

export type GestorStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export interface GestorProfile {
  id: string;
  user_id: string;
  slug: string;
  full_name: string;
  phone: string;
  ci_number: string;
  address: string;
  municipality: string;
  store_label: string;
  contact_whatsapp: string;
  hide_yole_sku: boolean;
  default_markups: Partial<Record<Department, number>>;
  status: GestorStatus;
  admin_note: string;
  created_at: string;
  approved_at?: string | null;
}

export interface PublicGestorCatalog {
  id: string;
  slug: string;
  store_label: string;
  contact_whatsapp: string;
  hide_yole_sku: boolean;
  default_markups: Partial<Record<Department, number>>;
  prices: Record<string, number>;
}

export interface GestorOrderSummary {
  order_code: string;
  status: OrderStatus;
  subtotal_usd: number;
  subtotal_cup: number;
  items_count: number;
  created_at: string;
}

export interface StoreSettings {
  id: string;
  store_name: string;
  tagline: string;
  whatsapp_number: string;
  location_text: string;
  usd_to_cup_rate: number;
  delivery_fee_cup: number;
  transfer_surcharge_pct: number;
  shein_under_20_markup: number;
  shein_even_20_plus_markup: number;
  shein_odd_20_plus_markup: number;
  no_returns_notice: string;
  hero_badge: string;
  hero_title: string;
  hero_subtitle: string;
  show_sold_out_public: boolean;
  flash_enabled?: boolean;
  flash_badge?: string;
  flash_title?: string;
  flash_subtitle?: string;
  flash_ends_at?: string | null;
  custom_synonyms?: CustomSynonymsMap;
  payment_rates?: PaymentRatesMap;
  updated_at?: string;
}

export interface Category {
  id: string;
  name: string;
  department: Department;
  sort_order: number;
}

export interface PricePreset {
  id: string;
  name: string;
  department: Department;
  currency: Currency;
  cost_price: number | null;
  price: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  sku: string;
  title: string;
  brand: string;
  department: Department;
  category_id: string;
  price_preset_id?: string | null;
  quality: string;
  currency: Currency;
  cost_price: number | null;
  price: number | null;
  sizes: string[];
  sold_out_sizes?: string[];
  fit_note: string;
  image_url: string;
  image_path: string;
  extra_images?: string[];
  video_url?: string;
  status: ProductStatus;
  featured: boolean;
  source_group: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface CartItem {
  product: Product;
  size: string;
  qty: number;
}

export interface OrderItemPayload {
  sku: string;
  title: string;
  size: string;
  qty: number;
  currency: Currency;
  unit_price: number | null;
  image_url?: string;
}

export interface Order {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  delivery_type: DeliveryType;
  delivery_address: string;
  payment_method: PaymentMethod;
  items: OrderItemPayload[];
  subtotal_cup: number;
  subtotal_usd: number;
  delivery_fee_cup: number;
  discount_code?: string;
  discount_cup?: number;
  discount_usd?: number;
  has_unpriced_items: boolean;
  notes: string;
  referral_code?: string;
  payment_channel?: string;
  shipping_zone?: string;
  status: OrderStatus;
  created_at: string;
  updated_at?: string;
}

export interface PublicOrderTracking {
  order_code: string;
  status: OrderStatus;
  delivery_type: DeliveryType;
  payment_method: PaymentMethod;
  customer_first_name: string;
  items: OrderItemPayload[];
  subtotal_cup: number;
  subtotal_usd: number;
  delivery_fee_cup: number;
  discount_code?: string;
  discount_cup?: number;
  discount_usd?: number;
  has_unpriced_items: boolean;
  created_at: string;
  updated_at?: string;
}

export type SizeRequestStatus = 'pendiente' | 'contactado' | 'surtido';

export interface SizeRequest {
  id: string;
  sku: string;
  product_title: string;
  requested_size: string;
  customer_name: string;
  customer_whatsapp: string;
  note: string;
  status: SizeRequestStatus;
  created_at: string;
}

export type CouponDiscountType = 'percent' | 'fixed_usd' | 'fixed_cup';

export interface Coupon {
  id: string;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  department: string;
  min_order_usd: number;
  is_reseller_vip: boolean;
  vip_label: string;
  max_uses?: number | null;
  uses_count?: number;
  expires_at?: string | null;
  active?: boolean;
  created_at?: string;
}

export interface CouponValidationResult {
  valid: boolean;
  reason?: string;
  coupon?: Coupon;
}

export type StoreEventType = 'product_view' | 'whatsapp_click' | 'cart_add' | 'search_empty';

export interface StoreEvent {
  id: string;
  event_type: StoreEventType;
  sku: string;
  product_title: string;
  query: string;
  created_at: string;
}

export const DEFAULT_SETTINGS: StoreSettings = {
  id: 'default',
  store_name: 'Yole Shop',
  tagline: 'Calzado urbano, moda Shein y accesorios en Santa Clara',
  whatsapp_number: '5352678747',
  location_text: 'Santa Clara, Villa Clara · Cuba',
  usd_to_cup_rate: 980,
  delivery_fee_cup: 300,
  transfer_surcharge_pct: 20,
  shein_under_20_markup: 2,
  shein_even_20_plus_markup: 2,
  shein_odd_20_plus_markup: 3,
  no_returns_notice:
    'Por favor compruebe su mercancía al momento de recibirla. No se aceptan devoluciones después de la venta.',
  hero_badge: 'Catálogo Oficial · Envío directo por WhatsApp',
  hero_title: 'Tenis, Moda Shein, Motos y Equipos Solares en un solo lugar.',
  hero_subtitle:
    'Más de 430 productos reales al día: Calzado 3A/G5, Moda Shein, Accesorios, Motos Eléctricas y Equipos Solares con precios CUP y USD directo por WhatsApp.',
  show_sold_out_public: false,
  flash_enabled: true,
  flash_badge: 'NUEVO DROP',
  flash_title: 'Recién Llegados · Drop de la Semana',
  flash_subtitle:
    'Lo más nuevo en calzado 3A/G5, Shein, movilidad eléctrica y energía solar con stock real',
  flash_ends_at: null,
};

export interface AppRelease {
  id: string;
  latest_version: string;
  min_version: string;
  mandatory: boolean;
  title: string;
  description: string;
  features: string[];
  released_at?: string;
  updated_at?: string;
}

export interface AdminSystemTableStat {
  name: string;
  rows: number;
  bytes: number;
  rls_enabled: boolean;
}

export interface AdminStorageFolderStat {
  folder: string;
  files: number;
  bytes: number;
}

export interface AdminSystemDiagnostics {
  checked_at: string;
  latency_ms?: number;
  pg_version: string;
  db_bytes: number;
  rls_tables: number;
  rls_policies: number;
  tables: AdminSystemTableStat[];
  storage: {
    bucket: string;
    total_files: number;
    total_bytes: number;
    image_files: number;
    video_files: number;
  };
  storage_folders: AdminStorageFolderStat[];
  missing_images: number;
  orphan_catalog_files: number;
  catalog: {
    total: number;
    active: number;
    sold_out: number;
    hidden: number;
    unpriced: number;
    featured: number;
    with_video: number;
    with_extra_images: number;
    categories: number;
    price_presets: number;
  };
  activity: {
    orders_total: number;
    orders_7d: number;
    orders_pending: number;
    gestores_total: number;
    gestores_active: number;
    gestores_pending: number;
    gestor_prices: number;
    coupons_active: number;
    size_requests_open: number;
    alert_subscribers: number;
    events_total: number;
  };
}

export const DEPARTMENT_LABELS: Record<Department, string> = {
  calzado: 'Calzado & Tenis',
  moda_shein: 'Moda Shein',
  hombre: 'Hombre',
  accesorios: 'Accesorios',
  movilidad: 'Motos & Todo Virginia',
  solares: 'Equipos Solares',
};
