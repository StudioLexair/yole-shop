export type Department = 'calzado' | 'moda_shein' | 'hombre' | 'accesorios';
export type Currency = 'CUP' | 'USD';
export type ProductStatus = 'active' | 'sold_out' | 'hidden';
export type DeliveryType = 'domicilio' | 'recogida';
export type PaymentMethod = 'efectivo' | 'transferencia' | 'usd';
export type OrderStatus = 'nuevo' | 'confirmado' | 'entregado' | 'cancelado';

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
  updated_at?: string;
}

export interface Category {
  id: string;
  name: string;
  department: Department;
  sort_order: number;
}

export interface Product {
  id: string;
  sku: string;
  title: string;
  brand: string;
  department: Department;
  category_id: string;
  quality: string;
  currency: Currency;
  cost_price: number | null;
  price: number | null;
  sizes: string[];
  fit_note: string;
  image_url: string;
  image_path: string;
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

export interface Order {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  delivery_type: DeliveryType;
  delivery_address: string;
  payment_method: PaymentMethod;
  items: Array<{
    sku: string;
    title: string;
    size: string;
    qty: number;
    currency: Currency;
    unit_price: number | null;
  }>;
  subtotal_cup: number;
  subtotal_usd: number;
  delivery_fee_cup: number;
  has_unpriced_items: boolean;
  notes: string;
  status: OrderStatus;
  created_at: string;
}

export const DEFAULT_SETTINGS: StoreSettings = {
  id: 'default',
  store_name: 'Yole Shop',
  tagline: 'Calzado urbano, moda Shein y accesorios en Santa Clara',
  whatsapp_number: '5352678747',
  location_text: 'Santa Clara, Villa Clara · Cuba',
  usd_to_cup_rate: 920,
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
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  calzado: 'Calzado & Tenis',
  moda_shein: 'Moda Shein',
  hombre: 'Hombre',
  accesorios: 'Carteras & Relojes',
};
