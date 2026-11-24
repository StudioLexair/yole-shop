export type Department = 'calzado' | 'moda_shein' | 'hombre' | 'accesorios' | 'movilidad' | 'solares';
export type Currency = 'CUP' | 'USD';
export type ProductStatus = 'active' | 'sold_out' | 'hidden';
export type DeliveryType = 'domicilio' | 'recogida';
export type PaymentMethod = 'efectivo' | 'transferencia' | 'usd';
export type OrderStatus = 'nuevo' | 'confirmado' | 'en_reparto' | 'entregado' | 'cancelado';

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
  hero_badge: 'Nueva Colección · Envío directo por WhatsApp',
  hero_title: 'Tu estilo urbano y moda Shein, en un solo lugar.',
  hero_subtitle:
    'Tenis 3A y G5 con tallas reales al día, vestidos y conjuntos Shein, relojes y accesorios con atención directa por WhatsApp.',
  show_sold_out_public: false,
  flash_enabled: true,
  flash_badge: 'NUEVO DROP',
  flash_title: 'Recién Llegados · Drop de la Semana',
  flash_subtitle:
    'Modelos recién agregados en calzado 3A/G5, Shein y accesorios con stock real',
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

export const DEPARTMENT_LABELS: Record<Department, string> = {
  calzado: 'Calzado & Tenis',
  moda_shein: 'Moda Shein',
  hombre: 'Hombre',
  accesorios: 'Accesorios',
  movilidad: 'Motos & Todo Virginia',
  solares: 'Equipos Solares',
};
