-- ============================================================
-- Yole Shop · Esquema completo en Supabase (PostgreSQL + RLS + Storage)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Administradores autorizados
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "admin_users_self_read" ON public.admin_users;
CREATE POLICY "admin_users_self_read" ON public.admin_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. Configuración global de la tienda
CREATE TABLE IF NOT EXISTS public.store_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  store_name TEXT NOT NULL DEFAULT 'Yole Shop',
  tagline TEXT NOT NULL DEFAULT 'Calzado urbano, moda Shein y accesorios en Santa Clara',
  whatsapp_number TEXT NOT NULL DEFAULT '5352678747',
  location_text TEXT NOT NULL DEFAULT 'Santa Clara, Villa Clara · Cuba',
  usd_to_cup_rate NUMERIC(10,2) NOT NULL DEFAULT 980,
  delivery_fee_cup NUMERIC(10,2) NOT NULL DEFAULT 300,
  transfer_surcharge_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  shein_under_20_markup NUMERIC(10,2) NOT NULL DEFAULT 2,
  shein_even_20_plus_markup NUMERIC(10,2) NOT NULL DEFAULT 2,
  shein_odd_20_plus_markup NUMERIC(10,2) NOT NULL DEFAULT 3,
  no_returns_notice TEXT NOT NULL DEFAULT 'Por favor compruebe su mercancía al momento de recibirla. No se aceptan devoluciones después de la venta.',
  hero_badge TEXT NOT NULL DEFAULT 'Nueva Colección · Envío directo por WhatsApp',
  hero_title TEXT NOT NULL DEFAULT 'Tu estilo urbano y moda Shein, en un solo lugar.',
  hero_subtitle TEXT NOT NULL DEFAULT 'Tenis 3A y G5 con tallas reales al día, vestidos y conjuntos Shein, relojes y accesorios con atención directa por WhatsApp.',
  show_sold_out_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_settings_public_read" ON public.store_settings;
CREATE POLICY "store_settings_public_read" ON public.store_settings
  FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "store_settings_admin_write" ON public.store_settings;
CREATE POLICY "store_settings_admin_write" ON public.store_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.store_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- 3. Categorías
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('calzado', 'moda_shein', 'hombre', 'accesorios')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_public_read" ON public.categories;
CREATE POLICY "categories_public_read" ON public.categories
  FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "categories_admin_write" ON public.categories;
CREATE POLICY "categories_admin_write" ON public.categories
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.categories (id, name, department, sort_order) VALUES
  ('tenis-new-balance', 'New Balance', 'calzado', 10),
  ('tenis-jordan', 'Air Jordan', 'calzado', 20),
  ('tenis-nike', 'Nike', 'calzado', 30),
  ('tenis-adidas', 'Adidas Campus', 'calzado', 40),
  ('tenis-champion-osiris', 'Champion & Skate', 'calzado', 50),
  ('tenis-lv-urbanos', 'LV & Urbanos', 'calzado', 60),
  ('botas-tacticas', 'Botas Tácticas', 'calzado', 70),
  ('zuecos-sandalias', 'Zuecos & Sandalias', 'calzado', 80),
  ('vestidos-shein', 'Vestidos Shein', 'moda_shein', 90),
  ('blusas-tops-shein', 'Blusas & Corsets', 'moda_shein', 100),
  ('conjuntos-mujer', 'Conjuntos & Faldas', 'moda_shein', 110),
  ('enterizos-leggings', 'Enterizos & Leggings', 'moda_shein', 120),
  ('moda-hombre', 'Moda Hombre', 'hombre', 130),
  ('bolsos-relojes', 'Accesorios', 'accesorios', 140)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  department = EXCLUDED.department,
  sort_order = EXCLUDED.sort_order;

-- 3b. Grupos / plantillas de precios masivos
CREATE TABLE IF NOT EXISTS public.price_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('calzado', 'moda_shein', 'hombre', 'accesorios')),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('CUP', 'USD')),
  cost_price NUMERIC(12,2),
  price NUMERIC(12,2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.price_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_presets_public_read" ON public.price_presets;
CREATE POLICY "price_presets_public_read" ON public.price_presets
  FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "price_presets_admin_write" ON public.price_presets;
CREATE POLICY "price_presets_admin_write" ON public.price_presets
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Productos
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'Yole Shop',
  department TEXT NOT NULL CHECK (department IN ('calzado', 'moda_shein', 'hombre', 'accesorios')),
  category_id TEXT NOT NULL REFERENCES public.categories(id) ON UPDATE CASCADE,
  price_preset_id TEXT REFERENCES public.price_presets(id) ON DELETE SET NULL,
  quality TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'CUP' CHECK (currency IN ('CUP', 'USD')),
  cost_price NUMERIC(12,2),
  price NUMERIC(12,2),
  sizes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  fit_note TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  image_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold_out', 'hidden')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  source_group TEXT NOT NULL DEFAULT 'catalog',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_dept ON public.products(department);
CREATE INDEX IF NOT EXISTS idx_products_cat ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_preset ON public.products(price_preset_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read" ON public.products
  FOR SELECT TO anon, authenticated
  USING (status <> 'hidden' OR public.is_admin());

DROP POLICY IF EXISTS "products_admin_write" ON public.products;
CREATE POLICY "products_admin_write" ON public.products
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. Pedidos enviados por WhatsApp
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  delivery_type TEXT NOT NULL DEFAULT 'domicilio' CHECK (delivery_type IN ('domicilio', 'recogida')),
  delivery_address TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'efectivo' CHECK (payment_method IN ('efectivo', 'transferencia', 'usd')),
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  subtotal_cup NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  delivery_fee_cup NUMERIC(12,2) NOT NULL DEFAULT 0,
  has_unpriced_items BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'confirmado', 'entregado', 'cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_public_insert" ON public.orders;
CREATE POLICY "orders_public_insert" ON public.orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(trim(customer_name)) >= 2
    AND jsonb_typeof(items) = 'array'
    AND jsonb_array_length(items) > 0
  );

DROP POLICY IF EXISTS "orders_admin_read" ON public.orders;
CREATE POLICY "orders_admin_read" ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
CREATE POLICY "orders_admin_update" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "orders_admin_delete" ON public.orders;
CREATE POLICY "orders_admin_delete" ON public.orders
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- 6. Storage Bucket yole-products (público lectura, escritura solo admin)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'yole-products',
  'yole-products',
  TRUE,
  5242880,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

DROP POLICY IF EXISTS "yole_products_public_select" ON storage.objects;
CREATE POLICY "yole_products_public_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'yole-products');

DROP POLICY IF EXISTS "yole_products_admin_insert" ON storage.objects;
CREATE POLICY "yole_products_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'yole-products' AND public.is_admin());

DROP POLICY IF EXISTS "yole_products_admin_update" ON storage.objects;
CREATE POLICY "yole_products_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'yole-products' AND public.is_admin())
  WITH CHECK (bucket_id = 'yole-products' AND public.is_admin());

DROP POLICY IF EXISTS "yole_products_admin_delete" ON storage.objects;
CREATE POLICY "yole_products_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'yole-products' AND public.is_admin());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated_at ON public.store_settings;
CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_price_presets_updated_at ON public.price_presets;
CREATE TRIGGER trg_price_presets_updated_at
  BEFORE UPDATE ON public.price_presets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
