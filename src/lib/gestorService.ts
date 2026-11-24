import type {
  AdminSystemDiagnostics,
  Department,
  GestorOrderSummary,
  GestorProfile,
  GestorStatus,
  Product,
  PublicGestorCatalog,
} from '../types';
import { supabase } from './supabase';

const PUBLIC_GESTOR_SLUG_KEY = 'yole_active_gestor_slug_v1';

export function normalizeGestorSlug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 28);
}

export function buildSyntheticGestorEmail(phoneOrSlug: string): string {
  const digits = phoneOrSlug.replace(/[^0-9]/g, '');
  const tag = digits.length >= 6 ? digits : normalizeGestorSlug(phoneOrSlug).toLowerCase() || 'gestor';
  return `g_${tag}@gestores.yoleshop.app`;
}

export function captureGestorSlugFromUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('oficial')) {
      window.localStorage.removeItem(PUBLIC_GESTOR_SLUG_KEY);
      return '';
    }
    const raw = params.get('g') || params.get('gestor') || params.get('ref') || '';
    const clean = normalizeGestorSlug(raw);
    if (clean) {
      window.localStorage.setItem(PUBLIC_GESTOR_SLUG_KEY, clean);
      return clean;
    }
    return readStoredGestorSlug();
  } catch {
    return '';
  }
}

export function readStoredGestorSlug(): string {
  if (typeof window === 'undefined') return '';
  try {
    return normalizeGestorSlug(window.localStorage.getItem(PUBLIC_GESTOR_SLUG_KEY) || '');
  } catch {
    return '';
  }
}

export function clearStoredGestorSlug(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PUBLIC_GESTOR_SLUG_KEY);
  } catch {
    // ignore
  }
}

export function buildGestorShareUrl(slug: string): string {
  const clean = normalizeGestorSlug(slug);
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://yoleshop.ddns.net';
  return `${origin}/?g=${encodeURIComponent(clean)}`;
}

export async function fetchPublicGestorCatalog(
  slug: string
): Promise<PublicGestorCatalog | null> {
  const clean = normalizeGestorSlug(slug);
  if (!clean) return null;
  const { data, error } = await supabase.rpc('get_public_gestor_catalog', {
    p_slug: clean,
  });
  if (error || !data) return null;
  const raw = data as {
    id: string;
    slug: string;
    store_label?: string;
    contact_whatsapp?: string;
    hide_yole_sku?: boolean;
    default_markups?: Partial<Record<Department, number>>;
    prices?: Array<{ product_id: string; custom_price: number }>;
  };
  const priceMap: Record<string, number> = {};
  for (const row of raw.prices || []) {
    if (row.product_id && Number.isFinite(Number(row.custom_price))) {
      priceMap[row.product_id] = Number(row.custom_price);
    }
  }
  return {
    id: raw.id,
    slug: raw.slug,
    store_label: raw.store_label || '',
    contact_whatsapp: raw.contact_whatsapp || '',
    hide_yole_sku: raw.hide_yole_sku !== false,
    default_markups: raw.default_markups || {},
    prices: priceMap,
  };
}

export function computeGestorProductPrice(
  product: Pick<Product, 'id' | 'department' | 'currency' | 'price'>,
  gestor: PublicGestorCatalog | Pick<GestorProfile, 'default_markups'> & { prices?: Record<string, number> },
  usdToCupRate: number
): number | null {
  if (product.price === null || !Number.isFinite(product.price)) return null;
  const base = product.price;
  const override = gestor.prices?.[product.id];
  if (override !== undefined && Number.isFinite(override)) {
    return Math.max(base, Math.round(override * 100) / 100);
  }
  const deptMarkupUsd = Number(gestor.default_markups?.[product.department] || 0);
  if (deptMarkupUsd > 0) {
    if (product.currency === 'CUP') {
      const rate = usdToCupRate > 0 ? usdToCupRate : 980;
      return Math.round(base + deptMarkupUsd * rate);
    }
    return Math.round((base + deptMarkupUsd) * 100) / 100;
  }
  return base;
}

export function applyGestorCatalogOverlay(
  products: Product[],
  gestor: PublicGestorCatalog | null,
  usdToCupRate: number
): Product[] {
  if (!gestor) return products;
  return products.map((p) => {
    const newPrice = computeGestorProductPrice(p, gestor, usdToCupRate);
    if (newPrice === p.price) return p;
    return {
      ...p,
      price: newPrice,
    };
  });
}

export async function registerGestorAccount(payload: {
  fullName: string;
  phone: string;
  ciNumber: string;
  address: string;
  municipality: string;
  slug: string;
  storeLabel?: string;
  email?: string;
  password: string;
}): Promise<GestorProfile> {
  const cleanSlug = normalizeGestorSlug(payload.slug || payload.fullName);
  if (cleanSlug.length < 3) {
    throw new Error('Tu alias de enlace debe tener al menos 3 letras o números.');
  }
  const cleanPhone = payload.phone.trim();
  if (cleanPhone.replace(/[^0-9]/g, '').length < 8) {
    throw new Error('Ingresa un número de teléfono / WhatsApp válido.');
  }
  const cleanCi = payload.ciNumber.replace(/[^0-9]/g, '');
  if (cleanCi.length !== 11) {
    throw new Error('El Carnet de Identidad (CI) debe tener exactamente 11 dígitos.');
  }
  if (payload.address.trim().length < 8) {
    throw new Error('Escribe tu dirección completa (calle, reparto, municipio y provincia).');
  }
  if (payload.password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  const authEmail =
    payload.email && payload.email.trim().includes('@')
      ? payload.email.trim().toLowerCase()
      : buildSyntheticGestorEmail(cleanPhone);

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: authEmail,
    password: payload.password,
    options: {
      data: {
        role: 'gestor',
        full_name: payload.fullName.trim(),
        phone: cleanPhone,
      },
    },
  });

  if (signUpError) {
    if (/already registered/i.test(signUpError.message)) {
      throw new Error('Ya existe una cuenta registrada con ese teléfono o correo. Inicia sesión.');
    }
    throw signUpError;
  }

  const uid = signUpData.user?.id;
  if (!uid) {
    throw new Error('No se pudo crear la cuenta de gestor.');
  }

  // Ensure session is active if signUp didn't attach immediately
  if (!signUpData.session) {
    const { error: loginErr } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: payload.password,
    });
    if (loginErr) throw loginErr;
  }

  const insertPayload = {
    user_id: uid,
    slug: cleanSlug,
    full_name: payload.fullName.trim(),
    phone: cleanPhone,
    ci_number: cleanCi,
    address: payload.address.trim(),
    municipality: payload.municipality.trim(),
    store_label: (payload.storeLabel || '').trim(),
    contact_whatsapp: cleanPhone,
    hide_yole_sku: true,
    default_markups: {},
    status: 'pending' as GestorStatus,
  };

  const { data: profile, error: profErr } = await supabase
    .from('gestores')
    .insert(insertPayload)
    .select('*')
    .single();

  if (profErr) {
    if (/duplicate|unique/i.test(profErr.message)) {
      throw new Error(`El alias "${cleanSlug}" ya está en uso. Elige otro alias.`);
    }
    throw profErr;
  }

  return profile as GestorProfile;
}

export async function loginGestorAccount(
  identifier: string,
  password: string
): Promise<GestorProfile | null> {
  const cleanId = identifier.trim();
  if (!cleanId || !password) {
    throw new Error('Ingresa tu teléfono/alias/correo y contraseña.');
  }

  let emailToUse = cleanId.includes('@') ? cleanId.toLowerCase() : '';
  if (!emailToUse) {
    const { data: resolved, error: resErr } = await supabase.rpc(
      'resolve_gestor_login_email',
      { p_identifier: cleanId }
    );
    if (resErr) throw resErr;
    emailToUse = (resolved as string) || buildSyntheticGestorEmail(cleanId);
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailToUse,
    password,
  });
  if (error) {
    throw new Error('Credenciales incorrectas. Verifica tu teléfono/alias y contraseña.');
  }
  if (!data.user) return null;

  const { data: prof } = await supabase
    .from('gestores')
    .select('*')
    .eq('user_id', data.user.id)
    .maybeSingle();

  return (prof as GestorProfile) || null;
}

export async function fetchCurrentGestorProfile(): Promise<GestorProfile | null> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;
  const { data } = await supabase
    .from('gestores')
    .select('*')
    .eq('user_id', userRes.user.id)
    .maybeSingle();
  return (data as GestorProfile) || null;
}

export async function updateOwnGestorProfile(
  gestorId: string,
  patch: Pick<
    GestorProfile,
    'store_label' | 'contact_whatsapp' | 'hide_yole_sku' | 'default_markups'
  >
): Promise<GestorProfile> {
  const { data, error } = await supabase
    .from('gestores')
    .update(patch)
    .eq('id', gestorId)
    .select('*')
    .single();
  if (error) throw error;
  return data as GestorProfile;
}

export async function fetchOwnGestorPrices(
  gestorId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('gestor_prices')
    .select('product_id, custom_price')
    .eq('gestor_id', gestorId);
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of data || []) {
    map[String(row.product_id)] = Number(row.custom_price);
  }
  return map;
}

export async function saveGestorProductPrice(
  gestorId: string,
  productId: string,
  customPrice: number
): Promise<void> {
  const { error } = await supabase.from('gestor_prices').upsert(
    {
      gestor_id: gestorId,
      product_id: productId,
      custom_price: customPrice,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'gestor_id,product_id' }
  );
  if (error) throw error;
}

export async function removeGestorProductPrice(
  gestorId: string,
  productId: string
): Promise<void> {
  const { error } = await supabase
    .from('gestor_prices')
    .delete()
    .eq('gestor_id', gestorId)
    .eq('product_id', productId);
  if (error) throw error;
}

export async function fetchGestorReferralOrders(): Promise<GestorOrderSummary[]> {
  const { data, error } = await supabase.rpc('get_gestor_referral_orders');
  if (error || !data) return [];
  return data as GestorOrderSummary[];
}

// === ADMIN GESTORES MANAGEMENT ===
export async function adminFetchAllGestores(): Promise<GestorProfile[]> {
  const { data, error } = await supabase
    .from('gestores')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as GestorProfile[];
}

export async function adminUpdateGestorStatus(
  id: string,
  status: GestorStatus,
  adminNote?: string
): Promise<GestorProfile> {
  const updatePayload: Partial<GestorProfile> = {
    status,
    approved_at: status === 'active' ? new Date().toISOString() : null,
  };
  if (adminNote !== undefined) {
    updatePayload.admin_note = adminNote;
  }
  const { data, error } = await supabase
    .from('gestores')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as GestorProfile;
}

export async function adminDeleteGestor(id: string): Promise<void> {
  const { error } = await supabase.from('gestores').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchAdminSystemDiagnostics(): Promise<AdminSystemDiagnostics> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { data, error } = await supabase.rpc('get_admin_system_diagnostics');
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (error) throw error;
  return {
    ...(data as AdminSystemDiagnostics),
    latency_ms: Math.max(1, Math.round(t1 - t0)),
  };
}
