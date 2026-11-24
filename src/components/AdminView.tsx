import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ImageDown,
  ImagePlus,
  Layers,
  Lock,
  LogOut,
  MessageCircle,
  Moon,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Sun,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
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
import { DEPARTMENT_LABELS } from '../types';
import {
  buildWhatsAppUrl,
  calcYoleSheinPrice,
  formatCup,
  formatUsd,
  formatWhatsAppOrderText,
  normalizeWhatsAppDigits,
  resolveProductImageUrl,
} from '../lib/pricing';
import { formatKb, optimizeImageToWebP } from '../lib/imageOptimizer';
import {
  downloadRemoteImage,
  generateWhatsAppStatusCard,
} from '../lib/mediaHelpers';
import {
  applyPresetToLinkedProducts,
  bulkUpdateProducts,
  deletePricePreset,
  deleteProduct,
  fetchOrders,
  makePresetSlug,
  readThemeMode,
  savePricePreset,
  saveProduct,
  saveStoreSettings,
  updateOrderStatus,
  uploadProductWebP,
  writeThemeMode,
  type ThemeMode,
} from '../lib/catalog';
import { supabase } from '../lib/supabase';

interface AdminViewProps {
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
  pricePresets: PricePreset[];
  themeMode?: ThemeMode;
  onToggleTheme?: () => void;
  onRefresh: () => Promise<void>;
  onBackToStore: () => void;
}

type AdminTab = 'products' | 'presets' | 'orders' | 'settings' | 'security';
type QuickFilter =
  | 'all'
  | 'unpriced'
  | 'calzado'
  | 'moda_shein'
  | 'hombre'
  | 'accesorios'
  | 'sold_out'
  | 'hidden';

interface RowDraft {
  title: string;
  brand: string;
  costStr: string;
  priceStr: string;
  currency: Currency;
  sizesStr: string;
  soldOutSizes: string[];
  extraImages: string[];
  fit_note: string;
  status: ProductStatus;
  featured: boolean;
  category_id: string;
  department: Department;
  price_preset_id: string;
  dirty: boolean;
}

interface PresetDraft {
  name: string;
  department: Department;
  currency: Currency;
  priceStr: string;
  dirty: boolean;
}

function makeDraft(p: Product): RowDraft {
  return {
    title: p.title,
    brand: p.brand,
    costStr: p.cost_price !== null ? String(p.cost_price) : '',
    priceStr: p.price !== null ? String(p.price) : '',
    currency: p.currency,
    sizesStr: p.sizes.join(', '),
    soldOutSizes: Array.isArray(p.sold_out_sizes) ? p.sold_out_sizes : [],
    extraImages: Array.isArray(p.extra_images) ? p.extra_images : [],
    fit_note: p.fit_note,
    status: p.status,
    featured: p.featured,
    category_id: p.category_id,
    department: p.department,
    price_preset_id: p.price_preset_id || '',
    dirty: false,
  };
}

function makePresetDraft(pr: PricePreset): PresetDraft {
  return {
    name: pr.name,
    department: pr.department,
    currency: pr.currency,
    priceStr: String(pr.price),
    dirty: false,
  };
}

function formatPresetShort(pr: PricePreset): string {
  const val = pr.currency === 'USD' ? `$${pr.price} USD` : formatCup(pr.price);
  return `${pr.name} — ${val}`;
}

export function AdminView({
  settings,
  categories,
  products,
  pricePresets,
  themeMode,
  onToggleTheme,
  onRefresh,
  onBackToStore,
}: AdminViewProps) {
  const [localTheme, setLocalTheme] = useState<ThemeMode>(() => themeMode ?? readThemeMode());
  const activeTheme = themeMode ?? localTheme;

  const handleToggleAdminTheme = () => {
    if (onToggleTheme) {
      onToggleTheme();
      return;
    }
    setLocalTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      writeThemeMode(next);
      return next;
    });
  };
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('studio.lexair@gmail.com');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [tab, setTab] = useState<AdminTab>('products');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [presetFilter, setPresetFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAllDirty, setSavingAllDirty] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [cardBusyId, setCardBusyId] = useState<string | null>(null);
  const [autoSaveOnPreset, setAutoSaveOnPreset] = useState(true);
  const [toast, setToast] = useState('');

  // Quick USD rate inline editor
  const [quickRateStr, setQuickRateStr] = useState(String(settings.usd_to_cup_rate));
  const [savingQuickRate, setSavingQuickRate] = useState(false);

  // Bulk selection & actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPresetId, setBulkPresetId] = useState<string>('');
  const [bulkPriceMode, setBulkPriceMode] = useState<'set' | 'add' | 'sub'>('set');
  const [bulkPriceVal, setBulkPriceVal] = useState('');
  const [bulkCurrency, setBulkCurrency] = useState<Currency>('USD');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Price Presets tab state
  const [presetDeptFilter, setPresetDeptFilter] = useState<Department | 'all'>('all');
  const [presetDrafts, setPresetDrafts] = useState<Record<string, PresetDraft>>({});
  const [savingPresetId, setSavingPresetId] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDept, setNewPresetDept] = useState<Department>('moda_shein');
  const [newPresetCurr, setNewPresetCurr] = useState<Currency>('USD');
  const [newPresetPrice, setNewPresetPrice] = useState('');
  const [creatingPreset, setCreatingPreset] = useState(false);

  // Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Settings draft
  const [cfg, setCfg] = useState<StoreSettings>(settings);
  const [savingCfg, setSavingCfg] = useState(false);

  // New product modal
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBrand, setNewBrand] = useState('SHEIN');
  const [newDept, setNewDept] = useState<Department>('moda_shein');
  const [newCat, setNewCat] = useState('vestidos-shein');
  const [newPresetId, setNewPresetId] = useState('');
  const [newQuality, setNewQuality] = useState('SHEIN');
  const [newCurrency, setNewCurrency] = useState<Currency>('USD');
  const [newCost, setNewCost] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newSizes, setNewSizes] = useState('S, M');
  const [newNote, setNewNote] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreviewInfo, setNewPreviewInfo] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);

  // Password change
  const [newPass1, setNewPass1] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [passMsg, setPassMsg] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3400);
  };

  useEffect(() => {
    setCfg(settings);
    setQuickRateStr(String(settings.usd_to_cup_rate));
  }, [settings]);

  useEffect(() => {
    const map: Record<string, RowDraft> = {};
    for (const p of products) {
      map[p.id] = makeDraft(p);
    }
    setDrafts(map);
    setSelectedIds((prev) => prev.filter((id) => products.some((p) => p.id === id)));
  }, [products]);

  useEffect(() => {
    const pmap: Record<string, PresetDraft> = {};
    for (const pr of pricePresets) {
      pmap[pr.id] = makePresetDraft(pr);
    }
    setPresetDrafts(pmap);
    if (!bulkPresetId && pricePresets.length > 0) {
      setBulkPresetId(pricePresets[0].id);
    }
  }, [pricePresets]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_ev, s) => {
      setSession(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const list = await fetchOrders();
      setOrders(list);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error cargando pedidos');
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (session && tab === 'orders') {
      loadOrders();
    }
  }, [session, tab]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setAuthError('Correo o contraseña incorrectos.');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  const kpis = useMemo(() => {
    const active = products.filter((p) => p.status === 'active').length;
    const unpriced = products.filter((p) => p.status !== 'hidden' && p.price === null).length;
    const soldOut = products.filter((p) => p.status === 'sold_out').length;
    return { total: products.length, active, unpriced, soldOut };
  }, [products]);

  const presetCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      if (p.price_preset_id) {
        counts[p.price_preset_id] = (counts[p.price_preset_id] || 0) + 1;
      }
    }
    return counts;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (quickFilter === 'unpriced' && p.price !== null) return false;
      if (quickFilter === 'sold_out' && p.status !== 'sold_out') return false;
      if (quickFilter === 'hidden' && p.status !== 'hidden') return false;
      if (
        (quickFilter === 'calzado' ||
          quickFilter === 'moda_shein' ||
          quickFilter === 'hombre' ||
          quickFilter === 'accesorios') &&
        p.department !== quickFilter
      ) {
        return false;
      }
      if (presetFilter === 'none' && p.price_preset_id) return false;
      if (presetFilter !== 'all' && presetFilter !== 'none' && p.price_preset_id !== presetFilter) {
        return false;
      }
      if (q) {
        const hay = `${p.sku} ${p.title} ${p.brand} ${p.quality} ${p.fit_note}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, quickFilter, presetFilter, search]);

  const dirtyProducts = useMemo(
    () => products.filter((p) => drafts[p.id]?.dirty),
    [products, drafts]
  );

  const visibleSelectedCount = useMemo(
    () => filteredProducts.filter((p) => selectedIds.includes(p.id)).length,
    [filteredProducts, selectedIds]
  );

  const allVisibleSelected =
    filteredProducts.length > 0 && visibleSelectedCount === filteredProducts.length;

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const visibleSet = new Set(filteredProducts.map((p) => p.id));
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      const merged = new Set([...selectedIds, ...filteredProducts.map((p) => p.id)]);
      setSelectedIds(Array.from(merged));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSaveQuickRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = Number(quickRateStr);
    if (!Number.isFinite(rate) || rate <= 0) {
      showToast('Ingresa una tasa válida en CUP');
      return;
    }
    setSavingQuickRate(true);
    try {
      const updated = { ...cfg, usd_to_cup_rate: Math.round(rate) };
      await saveStoreSettings(updated);
      await onRefresh();
      showToast(`Tasa actualizada: 1 USD = ${formatCup(updated.usd_to_cup_rate)}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error guardando tasa');
    } finally {
      setSavingQuickRate(false);
    }
  };

  const updateDraft = (id: string, patch: Partial<RowDraft>, autoCalcShein = false) => {
    setDrafts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const next: RowDraft = { ...cur, ...patch, dirty: true };
      if (autoCalcShein && patch.costStr !== undefined) {
        const val = parseFloat(patch.costStr);
        if (Number.isFinite(val) && val > 0) {
          next.currency = 'USD';
          next.priceStr = String(calcYoleSheinPrice(val, cfg));
        } else if (patch.costStr === '') {
          next.priceStr = '';
        }
      }
      return { ...prev, [id]: next };
    });
  };

  const handleRowPresetChange = async (p: Product, nextPresetId: string) => {
    const preset = pricePresets.find((pr) => pr.id === nextPresetId) || null;
    if (!preset) {
      updateDraft(p.id, { price_preset_id: '' });
      if (autoSaveOnPreset) {
        setSavingId(p.id);
        try {
          await bulkUpdateProducts([p.id], { price_preset_id: null });
          await onRefresh();
          showToast(`${p.sku} desvinculado del grupo`);
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Error actualizando');
        } finally {
          setSavingId(null);
        }
      }
      return;
    }

    updateDraft(p.id, {
      price_preset_id: preset.id,
      priceStr: String(preset.price),
      currency: preset.currency,
      costStr: preset.cost_price !== null ? String(preset.cost_price) : '',
    });

    if (autoSaveOnPreset) {
      setSavingId(p.id);
      try {
        await bulkUpdateProducts([p.id], {
          price_preset_id: preset.id,
          price: preset.price,
          currency: preset.currency,
          cost_price: preset.cost_price,
        });
        await onRefresh();
        showToast(
          `${p.sku} → ${preset.name} (${
            preset.currency === 'USD' ? formatUsd(preset.price) : formatCup(preset.price)
          })`
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Error asignando grupo');
      } finally {
        setSavingId(null);
      }
    }
  };

  const handleSaveRow = async (p: Product) => {
    const d = drafts[p.id];
    if (!d) return;
    setSavingId(p.id);
    try {
      const costNum = d.costStr.trim() === '' ? null : Number(d.costStr);
      const priceNum = d.priceStr.trim() === '' ? null : Number(d.priceStr);
      const sizesArr = d.sizesStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await saveProduct({
        id: p.id,
        sku: p.sku,
        title: d.title.trim() || p.title,
        brand: d.brand.trim() || p.brand,
        department: d.department,
        category_id: d.category_id,
        price_preset_id: d.price_preset_id || null,
        quality: p.quality,
        currency: d.currency,
        cost_price: Number.isFinite(costNum as number) ? costNum : null,
        price: Number.isFinite(priceNum as number) ? priceNum : null,
        sizes: sizesArr,
        sold_out_sizes: d.soldOutSizes.filter((s) => sizesArr.includes(s)),
        fit_note: d.fit_note.trim(),
        image_url: p.image_url,
        image_path: p.image_path,
        extra_images: d.extraImages,
        status: d.status,
        featured: d.featured,
        source_group: p.source_group,
        sort_order: p.sort_order,
      });
      await onRefresh();
      showToast(`Guardado ${p.sku}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error guardando producto');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveAllDirty = async () => {
    if (dirtyProducts.length === 0) return;
    setSavingAllDirty(true);
    try {
      for (const p of dirtyProducts) {
        const d = drafts[p.id];
        if (!d) continue;
        const costNum = d.costStr.trim() === '' ? null : Number(d.costStr);
        const priceNum = d.priceStr.trim() === '' ? null : Number(d.priceStr);
        const sizesArr = d.sizesStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        await saveProduct({
          id: p.id,
          sku: p.sku,
          title: d.title.trim() || p.title,
          brand: d.brand.trim() || p.brand,
          department: d.department,
          category_id: d.category_id,
          price_preset_id: d.price_preset_id || null,
          quality: p.quality,
          currency: d.currency,
          cost_price: Number.isFinite(costNum as number) ? costNum : null,
          price: Number.isFinite(priceNum as number) ? priceNum : null,
          sizes: sizesArr,
          sold_out_sizes: d.soldOutSizes.filter((s) => sizesArr.includes(s)),
          fit_note: d.fit_note.trim(),
          image_url: p.image_url,
          image_path: p.image_path,
          extra_images: d.extraImages,
          status: d.status,
          featured: d.featured,
          source_group: p.source_group,
          sort_order: p.sort_order,
        });
      }
      await onRefresh();
      showToast(`Se guardaron ${dirtyProducts.length} cambios pendientes`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error guardando cambios');
    } finally {
      setSavingAllDirty(false);
    }
  };

  // Bulk actions
  const handleBulkApplyPreset = async () => {
    const preset = pricePresets.find((pr) => pr.id === bulkPresetId);
    if (!preset || selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      await bulkUpdateProducts(selectedIds, {
        price_preset_id: preset.id,
        price: preset.price,
        currency: preset.currency,
        cost_price: preset.cost_price,
      });
      await onRefresh();
      showToast(
        `Grupo "${preset.name}" aplicado a ${selectedIds.length} productos`
      );
      setSelectedIds([]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error en aplicación masiva');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkApplyManualPrice = async () => {
    const num = Number(bulkPriceVal);
    if (!Number.isFinite(num) || num < 0 || selectedIds.length === 0) {
      showToast('Escribe un valor numérico válido');
      return;
    }
    setBulkBusy(true);
    try {
      if (bulkPriceMode === 'set') {
        await bulkUpdateProducts(selectedIds, {
          price: num,
          currency: bulkCurrency,
          price_preset_id: null,
        });
      } else {
        const delta = bulkPriceMode === 'add' ? num : -num;
        const selectedProducts = products.filter((p) => selectedIds.includes(p.id));
        await Promise.all(
          selectedProducts.map((p) => {
            const base = p.price ?? 0;
            const nextVal = Math.max(0, Math.round((base + delta) * 100) / 100);
            return bulkUpdateProducts([p.id], {
              price: nextVal,
              currency: p.price !== null ? p.currency : bulkCurrency,
            });
          })
        );
      }
      await onRefresh();
      showToast(`Precio actualizado en ${selectedIds.length} productos`);
      setBulkPriceVal('');
      setSelectedIds([]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error actualizando precios');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkStatusOrConsult = async (mode: ProductStatus | 'consult') => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      if (mode === 'consult') {
        await bulkUpdateProducts(selectedIds, {
          price: null,
          price_preset_id: null,
        });
        showToast(`${selectedIds.length} productos pasados a "Consultar"`);
      } else {
        await bulkUpdateProducts(selectedIds, { status: mode });
        showToast(`${selectedIds.length} productos marcados como ${mode}`);
      }
      await onRefresh();
      setSelectedIds([]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error en acción masiva');
    } finally {
      setBulkBusy(false);
    }
  };

  // Price Presets handlers
  const handleSaveAndApplyPreset = async (pr: PricePreset) => {
    const d = presetDrafts[pr.id];
    if (!d) return;
    const priceNum = Number(d.priceStr);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      showToast('El precio del grupo debe ser un número válido');
      return;
    }
    setSavingPresetId(pr.id);
    try {
      const saved = await savePricePreset({
        id: pr.id,
        name: d.name.trim() || pr.name,
        department: d.department,
        currency: d.currency,
        cost_price: pr.cost_price,
        price: priceNum,
        sort_order: pr.sort_order,
      });
      const updatedCount = await applyPresetToLinkedProducts(saved);
      await onRefresh();
      showToast(
        `"${saved.name}" guardado y aplicado a ${updatedCount} productos vinculados`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error guardando grupo');
    } finally {
      setSavingPresetId(null);
    }
  };

  const handleCreatePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = Number(newPresetPrice);
    if (!newPresetName.trim() || !Number.isFinite(priceNum) || priceNum <= 0) {
      showToast('Completa el nombre y un precio mayor a 0');
      return;
    }
    setCreatingPreset(true);
    try {
      const slug = `${newPresetDept.split('_')[0]}-${makePresetSlug(newPresetName)}`;
      const exists = pricePresets.some((p) => p.id === slug);
      const id = exists ? `${slug}-${Date.now().toString().slice(-4)}` : slug;
      const nextSort =
        pricePresets.reduce((m, p) => Math.max(m, p.sort_order), 0) + 10;

      await savePricePreset({
        id,
        name: newPresetName.trim(),
        department: newPresetDept,
        currency: newPresetCurr,
        cost_price: null,
        price: priceNum,
        sort_order: nextSort,
      });
      setNewPresetName('');
      setNewPresetPrice('');
      await onRefresh();
      showToast(`Grupo "${newPresetName.trim()}" creado`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error creando grupo');
    } finally {
      setCreatingPreset(false);
    }
  };

  const handleDeletePreset = async (pr: PricePreset) => {
    const linked = presetCounts[pr.id] || 0;
    const msg =
      linked > 0
        ? `¿Eliminar el grupo "${pr.name}"? Sus ${linked} productos mantendrán su precio actual pero quedarán sin grupo.`
        : `¿Eliminar el grupo "${pr.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deletePricePreset(pr.id);
      await onRefresh();
      showToast(`Grupo "${pr.name}" eliminado`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error eliminando grupo');
    }
  };

  const handleRowImageUpload = async (p: Product, file: File) => {
    setUploadingId(p.id);
    try {
      const opt = await optimizeImageToWebP(file);
      const { imageUrl, imagePath } = await uploadProductWebP(p.sku, opt.blob);
      await saveProduct({
        ...p,
        image_url: imageUrl,
        image_path: imagePath,
      });
      await onRefresh();
      showToast(
        `Foto ${p.sku} optimizada (${formatKb(opt.originalBytes)} → ${formatKb(opt.optimizedBytes)} WebP)`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo subir la imagen');
    } finally {
      setUploadingId(null);
    }
  };

  const handleRowExtraImagesUpload = async (p: Product, fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setUploadingId(p.id);
    try {
      const uploadedUrls: string[] = [];
      for (const f of files) {
        const opt = await optimizeImageToWebP(f);
        const { imageUrl } = await uploadProductWebP(`${p.sku}-extra`, opt.blob);
        uploadedUrls.push(imageUrl);
      }
      const nextExtras = [...(p.extra_images || []), ...uploadedUrls];
      await saveProduct({
        ...p,
        extra_images: nextExtras,
      });
      await onRefresh();
      showToast(`${uploadedUrls.length} foto(s) extra agregadas a ${p.sku}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudieron subir las fotos');
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemoveExtraImage = async (p: Product, targetUrl: string) => {
    const d = drafts[p.id] || makeDraft(p);
    const nextExtras = d.extraImages.filter((u) => u !== targetUrl);
    updateDraft(p.id, { extraImages: nextExtras });
    try {
      await saveProduct({
        ...p,
        extra_images: nextExtras,
      });
      await onRefresh();
      showToast(`Foto extra quitada de ${p.sku}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo quitar la foto');
    }
  };

  const toggleRowSoldOutSize = (p: Product, sz: string) => {
    const d = drafts[p.id] || makeDraft(p);
    const exists = d.soldOutSizes.includes(sz);
    const next = exists
      ? d.soldOutSizes.filter((s) => s !== sz)
      : [...d.soldOutSizes, sz];
    updateDraft(p.id, { soldOutSizes: next });
  };

  const handleDownloadStatusCard = async (p: Product) => {
    setCardBusyId(p.id);
    try {
      const blob = await generateWhatsAppStatusCard(p, cfg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `YoleShop-${p.sku}-estado.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast(`Tarjeta Estado WhatsApp generada (${p.sku})`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo generar la tarjeta');
    } finally {
      setCardBusyId(null);
    }
  };

  const handleDeleteRow = async (p: Product) => {
    if (!window.confirm(`¿Eliminar definitivamente [${p.sku}] ${p.title}?`)) return;
    try {
      await deleteProduct(p.id);
      await onRefresh();
      showToast(`Eliminado ${p.sku}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const handleNewFileChange = async (file: File | null) => {
    setNewFile(file);
    setNewPreviewInfo('');
    if (!file) return;
    try {
      const opt = await optimizeImageToWebP(file);
      setNewPreviewInfo(
        `WebP listo: ${opt.width}x${opt.height}px · ${formatKb(opt.originalBytes)} → ${formatKb(opt.optimizedBytes)}`
      );
    } catch {
      setNewPreviewInfo('Imagen seleccionada');
    }
  };

  const handleSelectNewProductPreset = (pid: string) => {
    setNewPresetId(pid);
    const pr = pricePresets.find((x) => x.id === pid);
    if (pr) {
      setNewDept(pr.department);
      setNewCurrency(pr.currency);
      setNewPrice(String(pr.price));
      const firstCat = categories.find((c) => c.department === pr.department);
      if (firstCat) setNewCat(firstCat.id);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFile || !newTitle.trim()) return;
    setCreatingNew(true);
    try {
      const nextNum =
        products.reduce((max, pr) => {
          const m = /YOL-(\d+)/.exec(pr.sku);
          return m ? Math.max(max, Number(m[1])) : max;
        }, 223) + 1;
      const sku = `YOL-${String(nextNum).padStart(3, '0')}`;
      const opt = await optimizeImageToWebP(newFile);
      const { imageUrl, imagePath } = await uploadProductWebP(sku, opt.blob);

      const costNum = newCost.trim() === '' ? null : Number(newCost);
      const priceNum = newPrice.trim() === '' ? null : Number(newPrice);

      await saveProduct({
        sku,
        title: newTitle.trim(),
        brand: newBrand.trim() || 'Yole Shop',
        department: newDept,
        category_id: newCat,
        price_preset_id: newPresetId || null,
        quality: newQuality.trim(),
        currency: newCurrency,
        cost_price: Number.isFinite(costNum as number) ? costNum : null,
        price: Number.isFinite(priceNum as number) ? priceNum : null,
        sizes: newSizes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        fit_note: newNote.trim(),
        image_url: imageUrl,
        image_path: imagePath,
        status: 'active',
        featured: false,
        source_group: 'admin_upload',
        sort_order: nextNum * 10,
      });

      setNewOpen(false);
      setNewTitle('');
      setNewPresetId('');
      setNewCost('');
      setNewPrice('');
      setNewNote('');
      setNewFile(null);
      setNewPreviewInfo('');
      await onRefresh();
      showToast(`Producto ${sku} publicado con imagen WebP optimizada`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error creando producto');
    } finally {
      setCreatingNew(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCfg(true);
    try {
      await saveStoreSettings(cfg);
      await onRefresh();
      showToast('Configuración guardada en Supabase');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error guardando configuración');
    } finally {
      setSavingCfg(false);
    }
  };

  const handleOrderStatus = async (id: string, status: OrderStatus) => {
    try {
      await updateOrderStatus(id, status);
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
      showToast('Estado del pedido actualizado');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg('');
    if (newPass1.length < 8) {
      setPassMsg('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPass1 !== newPass2) {
      setPassMsg('Las contraseñas no coinciden.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPass1 });
    if (error) {
      setPassMsg(error.message);
    } else {
      setPassMsg('Contraseña actualizada correctamente.');
      setNewPass1('');
      setNewPass2('');
    }
  };

  const handleExportCsv = () => {
    const header = [
      'SKU',
      'Titulo',
      'Marca',
      'Departamento',
      'Categoria',
      'GrupoPrecio',
      'Calidad',
      'Moneda',
      'Costo',
      'Venta',
      'Tallas',
      'Estado',
      'Imagen',
    ];
    const rows = products.map((p) => [
      p.sku,
      `"${p.title.replace(/"/g, '""')}"`,
      p.brand,
      p.department,
      p.category_id,
      p.price_preset_id || '',
      p.quality,
      p.currency,
      p.cost_price ?? '',
      p.price ?? '',
      `"${p.sizes.join(', ')}"`,
      p.status,
      p.image_url,
    ]);
    const csv = '\uFEFF' + [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yole-shop-catalogo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const orderMetrics = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    let nuevo = 0;
    let confirmado = 0;
    let entregado = 0;
    let cancelado = 0;
    let monthTotalCup = 0;

    for (const o of orders) {
      if (o.status === 'nuevo') nuevo += 1;
      else if (o.status === 'confirmado') confirmado += 1;
      else if (o.status === 'entregado') entregado += 1;
      else if (o.status === 'cancelado') cancelado += 1;

      const d = new Date(o.created_at);
      if (
        o.status !== 'cancelado' &&
        d.getMonth() === curMonth &&
        d.getFullYear() === curYear
      ) {
        monthTotalCup += Number(o.subtotal_cup) || 0;
      }
    }

    const rate = cfg.usd_to_cup_rate > 0 ? cfg.usd_to_cup_rate : 980;
    const monthTotalUsd = Math.round((monthTotalCup / rate) * 100) / 100;
    return { nuevo, confirmado, entregado, cancelado, monthTotalCup, monthTotalUsd };
  }, [orders, cfg.usd_to_cup_rate]);

  const handleExportOrdersCsv = () => {
    const header = [
      'Codigo',
      'Fecha',
      'Cliente',
      'Telefono',
      'Entrega',
      'Direccion',
      'Pago',
      'Estado',
      'Articulos',
      'Subtotal_CUP',
      'Subtotal_USD',
      'Domicilio_CUP',
      'Nota',
    ];
    const rows = orders.map((o) => {
      const itemsSummary = o.items
        .map((it) => `${it.qty}x ${it.sku} ${it.title} (${it.size})`)
        .join(' | ');
      return [
        o.order_code,
        `"${new Date(o.created_at).toLocaleString('es-ES')}"`,
        `"${o.customer_name.replace(/"/g, '""')}"`,
        `"${(o.customer_phone || '').replace(/"/g, '""')}"`,
        o.delivery_type,
        `"${(o.delivery_address || '').replace(/"/g, '""')}"`,
        o.payment_method,
        o.status,
        `"${itemsSummary.replace(/"/g, '""')}"`,
        o.subtotal_cup,
        o.subtotal_usd,
        o.delivery_fee_cup,
        `"${(o.notes || '').replace(/"/g, '""')}"`,
      ];
    });
    const csv = '\uFEFF' + [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yole-shop-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const filteredPresets = useMemo(() => {
    if (presetDeptFilter === 'all') return pricePresets;
    return pricePresets.filter((pr) => pr.department === presetDeptFilter);
  }, [pricePresets, presetDeptFilter]);

  if (authLoading) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">Cargando sesión...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <button type="button" className="btn-link" onClick={onBackToStore}>
            <ArrowLeft size={16} /> Volver a {settings.store_name}
          </button>
          <div className="admin-login-head">
            <img
              src="/brand-logo.webp"
              alt={`Logo ${settings.store_name}`}
              className="admin-login-logo"
              width={92}
              height={92}
            />
            <h1>Panel Admin · {settings.store_name}</h1>
            <p>Gestiona precios por grupos, tasa USD, fotos WebP y pedidos WhatsApp.</p>
          </div>
          <form onSubmit={handleLogin} className="admin-login-form">
            <label className="field">
              <span>Correo administrador</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input
                type="password"
                required
                placeholder="Tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {authError && <p className="form-error">{authError}</p>}
            <button type="submit" className="btn btn--primary btn--block">
              Entrar al Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar__left">
          <button type="button" className="btn-ghost" onClick={onBackToStore}>
            <ArrowLeft size={17} />
            <span>Tienda</span>
          </button>
          <span className="brand-monogram brand-monogram--img admin-topbar-logo">
            <img src="/brand-mark.webp" alt="" width={34} height={34} />
          </span>
          <div>
            <strong>Admin · {settings.store_name}</strong>
            <small>{session.user.email}</small>
          </div>
        </div>

        <nav className="admin-tabs">
          <button
            type="button"
            className={tab === 'products' ? 'is-active' : ''}
            onClick={() => setTab('products')}
          >
            <Package size={16} /> Catálogo ({kpis.total})
          </button>
          <button
            type="button"
            className={tab === 'presets' ? 'is-active' : ''}
            onClick={() => setTab('presets')}
          >
            <Layers size={16} /> Grupos de Precio ({pricePresets.length})
          </button>
          <button
            type="button"
            className={tab === 'orders' ? 'is-active' : ''}
            onClick={() => setTab('orders')}
          >
            <ShoppingCart size={16} /> Pedidos
          </button>
          <button
            type="button"
            className={tab === 'settings' ? 'is-active' : ''}
            onClick={() => setTab('settings')}
          >
            <Settings size={16} /> Ajustes
          </button>
          <button
            type="button"
            className={tab === 'security' ? 'is-active' : ''}
            onClick={() => setTab('security')}
          >
            <Lock size={16} /> Clave
          </button>
        </nav>

        <div className="admin-topbar__right">
          <button
            type="button"
            className="btn-ghost"
            onClick={handleToggleAdminTheme}
            title={activeTheme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            aria-label={activeTheme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {activeTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button type="button" className="btn-ghost" onClick={onRefresh} title="Recargar datos">
            <RefreshCw size={16} />
          </button>
          <button type="button" className="btn-ghost" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Salir</span>
          </button>
        </div>
      </header>

      {toast && (
        <div className="admin-toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
        </div>
      )}

      <main className="admin-main">
        <section className="admin-kpis">
          <div className="kpi-card">
            <span>Activos en tienda</span>
            <strong>{kpis.active}</strong>
          </div>
          <div className={`kpi-card${kpis.unpriced > 0 ? ' kpi-card--warn' : ''}`}>
            <span>En &quot;Consultar&quot; (sin precio)</span>
            <strong>{kpis.unpriced}</strong>
          </div>
          <div className="kpi-card">
            <span>Grupos de precio guardados</span>
            <strong>{pricePresets.length}</strong>
          </div>
          <form className="kpi-card kpi-card--rate" onSubmit={handleSaveQuickRate}>
            <span>Tasa rápida (1 USD → CUP)</span>
            <div className="kpi-rate-row">
              <input
                type="number"
                min="1"
                step="1"
                value={quickRateStr}
                onChange={(e) => setQuickRateStr(e.target.value)}
                aria-label="Tasa USD del día en CUP"
              />
              <button
                type="submit"
                className="btn btn--primary btn--sm"
                disabled={savingQuickRate}
              >
                {savingQuickRate ? '...' : 'Guardar'}
              </button>
            </div>
          </form>
        </section>

        {tab === 'presets' && (
          <section className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <h2 style={{ margin: '0 0 4px' }}>Grupos de Precio Masivos</h2>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                  Cambia el precio de un grupo (ej. Vestidos cortos, Enguatadas, Jordan 3A) y pulsa{' '}
                  <strong>Guardar y aplicar</strong> para actualizar todos sus productos de una vez.
                </p>
              </div>
            </div>

            <form className="preset-create-bar" onSubmit={handleCreatePreset}>
              <input
                type="text"
                className="tbl-input"
                placeholder="Nuevo grupo (ej. Gafas Polarizadas, Pijamas...)"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                required
              />
              <select
                className="tbl-select"
                value={newPresetDept}
                onChange={(e) => setNewPresetDept(e.target.value as Department)}
              >
                {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((k) => (
                  <option key={k} value={k}>
                    {DEPARTMENT_LABELS[k]}
                  </option>
                ))}
              </select>
              <select
                className="tbl-select"
                value={newPresetCurr}
                onChange={(e) => setNewPresetCurr(e.target.value as Currency)}
              >
                <option value="USD">USD</option>
                <option value="CUP">CUP</option>
              </select>
              <input
                type="number"
                step="any"
                min="0"
                className="tbl-input"
                placeholder="Precio"
                value={newPresetPrice}
                onChange={(e) => setNewPresetPrice(e.target.value)}
                required
              />
              <button type="submit" className="btn btn--primary btn--sm" disabled={creatingPreset}>
                <Plus size={15} /> {creatingPreset ? 'Creando...' : 'Crear grupo'}
              </button>
            </form>

            <div className="admin-toolbar__filters" style={{ marginBottom: 14 }}>
              <button
                type="button"
                className={`chip${presetDeptFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => setPresetDeptFilter('all')}
              >
                Todos ({pricePresets.length})
              </button>
              {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((dep) => (
                <button
                  key={dep}
                  type="button"
                  className={`chip${presetDeptFilter === dep ? ' is-active' : ''}`}
                  onClick={() => setPresetDeptFilter(dep)}
                >
                  {DEPARTMENT_LABELS[dep]}
                </button>
              ))}
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nombre del grupo</th>
                    <th>Departamento</th>
                    <th>Moneda</th>
                    <th>Precio del grupo</th>
                    <th>Productos vinculados</th>
                    <th>Acciones automáticas</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPresets.map((pr) => {
                    const d = presetDrafts[pr.id] || makePresetDraft(pr);
                    const linkedCount = presetCounts[pr.id] || 0;
                    const updatePrDraft = (patch: Partial<PresetDraft>) =>
                      setPresetDrafts((prev) => ({
                        ...prev,
                        [pr.id]: { ...d, ...patch, dirty: true },
                      }));
                    return (
                      <tr key={pr.id} className={d.dirty ? 'is-dirty' : ''}>
                        <td data-label="Grupo">
                          <input
                            type="text"
                            className="tbl-input tbl-input--title"
                            value={d.name}
                            onChange={(e) => updatePrDraft({ name: e.target.value })}
                          />
                        </td>
                        <td data-label="Departamento">
                          <select
                            className="tbl-select"
                            value={d.department}
                            onChange={(e) =>
                              updatePrDraft({ department: e.target.value as Department })
                            }
                          >
                            {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((k) => (
                              <option key={k} value={k}>
                                {DEPARTMENT_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td data-label="Moneda">
                          <select
                            className="tbl-select tbl-select--curr"
                            value={d.currency}
                            onChange={(e) =>
                              updatePrDraft({ currency: e.target.value as Currency })
                            }
                          >
                            <option value="USD">USD</option>
                            <option value="CUP">CUP</option>
                          </select>
                        </td>
                        <td data-label="Precio del grupo">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className="tbl-input tbl-input--num"
                            value={d.priceStr}
                            onChange={(e) => updatePrDraft({ priceStr: e.target.value })}
                          />
                        </td>
                        <td data-label="Vinculados">
                          <button
                            type="button"
                            className="btn-outline"
                            onClick={() => {
                              setQuickFilter('all');
                              setPresetFilter(pr.id);
                              setTab('products');
                            }}
                          >
                            Ver {linkedCount} productos
                          </button>
                        </td>
                        <td data-label="Acciones">
                          <div className="tbl-actions">
                            <button
                              type="button"
                              className={`btn-save${d.dirty ? ' is-ready' : ''}`}
                              disabled={savingPresetId === pr.id}
                              onClick={() => handleSaveAndApplyPreset(pr)}
                            >
                              <Zap size={14} />
                              <span>
                                {savingPresetId === pr.id
                                  ? 'Aplicando...'
                                  : `Guardar y aplicar (${linkedCount})`}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="btn-del-row"
                              title="Eliminar grupo"
                              onClick={() => handleDeletePreset(pr)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'products' && (
          <section className="admin-panel">
            <div className="admin-toolbar">
              <div className="admin-toolbar__filters">
                {(
                  [
                    ['all', `Todos (${kpis.total})`],
                    ['unpriced', `Consultar (${kpis.unpriced})`],
                    ['calzado', 'Calzado'],
                    ['moda_shein', 'Moda Shein'],
                    ['hombre', 'Hombre'],
                    ['accesorios', 'Accesorios'],
                    ['sold_out', 'Agotados'],
                    ['hidden', 'Ocultos'],
                  ] as Array<[QuickFilter, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`chip${quickFilter === key ? ' is-active' : ''}`}
                    onClick={() => setQuickFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="admin-toolbar__actions">
                <div className="search-box">
                  <Search size={16} />
                  <input
                    type="search"
                    placeholder="Buscar SKU, marca o modelo..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <select
                  className="tbl-select preset-filter-sel"
                  aria-label="Filtrar por grupo de precio"
                  value={presetFilter}
                  onChange={(e) => setPresetFilter(e.target.value)}
                >
                  <option value="all">Todos los grupos de precio</option>
                  <option value="none">Sin grupo asignado</option>
                  {pricePresets.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {formatPresetShort(pr)} ({presetCounts[pr.id] || 0})
                    </option>
                  ))}
                </select>

                <button type="button" className="btn-outline" onClick={handleExportCsv}>
                  <Download size={16} /> CSV
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setNewOpen(true)}
                >
                  <Plus size={16} /> Nuevo producto
                </button>
              </div>
            </div>

            <div className="admin-automation-strip">
              <label className="chk-inline">
                <input
                  type="checkbox"
                  checked={autoSaveOnPreset}
                  onChange={(e) => setAutoSaveOnPreset(e.target.checked)}
                />
                <span>
                  <strong>Auto-guardar al cambiar grupo</strong> en cualquier fila (un clic carga el precio y guarda directo en Supabase)
                </span>
              </label>

              <div className="admin-automation-strip__right">
                <button
                  type="button"
                  className="btn-outline mobile-select-all-btn"
                  onClick={toggleSelectAllVisible}
                >
                  {allVisibleSelected
                    ? `Quitar selección (${visibleSelectedCount})`
                    : `Seleccionar visibles (${filteredProducts.length})`}
                </button>
                {dirtyProducts.length > 0 && (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={savingAllDirty}
                    onClick={handleSaveAllDirty}
                  >
                    <Save size={14} />{' '}
                    {savingAllDirty
                      ? 'Guardando...'
                      : `Guardar ${dirtyProducts.length} cambios pendientes`}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setTab('presets')}
                >
                  <Layers size={14} /> Editar precios por grupo
                </button>
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div className="bulk-bar" role="region" aria-label="Acciones masivas">
                <div className="bulk-bar__head">
                  <strong>{selectedIds.length} productos seleccionados</strong>
                  <button
                    type="button"
                    className="btn-link"
                    style={{ color: '#fff' }}
                    onClick={() => setSelectedIds([])}
                  >
                    Limpiar selección
                  </button>
                </div>

                <div className="bulk-bar__controls">
                  <div className="bulk-group">
                    <span>Cargar grupo de precio:</span>
                    <select
                      value={bulkPresetId}
                      onChange={(e) => setBulkPresetId(e.target.value)}
                    >
                      {pricePresets.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {formatPresetShort(pr)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn--sm bulk-btn-white"
                      disabled={bulkBusy || !bulkPresetId}
                      onClick={handleBulkApplyPreset}
                    >
                      <Zap size={14} /> Aplicar grupo
                    </button>
                  </div>

                  <div className="bulk-group">
                    <span>Precio manual:</span>
                    <select
                      value={bulkPriceMode}
                      onChange={(e) => setBulkPriceMode(e.target.value as 'set' | 'add' | 'sub')}
                    >
                      <option value="set">Fijar en</option>
                      <option value="add">Sumar (+)</option>
                      <option value="sub">Restar (-)</option>
                    </select>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Monto"
                      value={bulkPriceVal}
                      onChange={(e) => setBulkPriceVal(e.target.value)}
                    />
                    <select
                      value={bulkCurrency}
                      onChange={(e) => setBulkCurrency(e.target.value as Currency)}
                    >
                      <option value="USD">USD</option>
                      <option value="CUP">CUP</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn--sm bulk-btn-white"
                      disabled={bulkBusy}
                      onClick={handleBulkApplyManualPrice}
                    >
                      Aplicar
                    </button>
                  </div>

                  <div className="bulk-group">
                    <button
                      type="button"
                      className="btn btn--sm bulk-btn-ghost"
                      disabled={bulkBusy}
                      onClick={() => handleBulkStatusOrConsult('active')}
                    >
                      Activos
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm bulk-btn-ghost"
                      disabled={bulkBusy}
                      onClick={() => handleBulkStatusOrConsult('sold_out')}
                    >
                      Agotados
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm bulk-btn-ghost"
                      disabled={bulkBusy}
                      onClick={() => handleBulkStatusOrConsult('consult')}
                    >
                      Pasar a Consultar
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        title="Seleccionar todos los visibles"
                        aria-label="Seleccionar todos los productos visibles"
                      />
                    </th>
                    <th>Foto / SKU</th>
                    <th>Producto y Categoría</th>
                    <th>Grupo de Precio (1 clic)</th>
                    <th>Precio Venta</th>
                    <th>Tallas</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const d = drafts[p.id] || makeDraft(p);
                    const checked = selectedIds.includes(p.id);
                    const costNum = parseFloat(d.costStr);
                    const previewMarkup =
                      d.currency === 'USD' && Number.isFinite(costNum) && costNum > 0
                        ? calcYoleSheinPrice(costNum, cfg) - costNum
                        : null;
                    const displayCostVal =
                      d.currency === 'CUP' && d.costStr === d.priceStr ? '' : d.costStr;
                    return (
                      <tr key={p.id} className={`${d.dirty ? 'is-dirty' : ''} ${checked ? 'is-selected' : ''}`}>
                        <td className="tbl-chk-cell">
                          <label className="chk-inline">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelectRow(p.id)}
                              aria-label={`Seleccionar ${p.sku}`}
                            />
                            <span className="mobile-only-label">Seleccionar {p.sku}</span>
                          </label>
                        </td>
                        <td data-label="Foto / SKU">
                          <div className="tbl-photo-cell">
                            <img src={p.image_url} alt={p.sku} loading="lazy" />
                            <div className="tbl-photo-meta">
                              <strong>{p.sku}</strong>
                              <div className="tbl-photo-btns">
                                <label className="upload-mini-btn">
                                  <ImagePlus size={13} />
                                  <span>{uploadingId === p.id ? 'Subiendo...' : 'Foto WebP'}</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleRowImageUpload(p, f);
                                    }}
                                  />
                                </label>
                                <label className="upload-mini-btn" title="Agregar 2da o 3ra foto al producto">
                                  <Plus size={12} />
                                  <span>Foto extra</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    hidden
                                    onChange={(e) => {
                                      if (e.target.files?.length) {
                                        handleRowExtraImagesUpload(p, e.target.files);
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                              {d.extraImages.length > 0 && (
                                <div className="tbl-extra-thumbs">
                                  {d.extraImages.map((exUrl) => (
                                    <span key={exUrl} className="tbl-extra-thumb">
                                      <img src={exUrl} alt="Vista extra" />
                                      <button
                                        type="button"
                                        title="Quitar foto extra"
                                        aria-label="Quitar foto extra"
                                        onClick={() => handleRemoveExtraImage(p, exUrl)}
                                      >
                                        <X size={10} />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td data-label="Producto y Categoría">
                          <div className="tbl-stack">
                            <input
                              type="text"
                              className="tbl-input tbl-input--title"
                              value={d.title}
                              onChange={(e) => updateDraft(p.id, { title: e.target.value })}
                            />
                            <div className="tbl-subinputs">
                              <input
                                type="text"
                                className="tbl-input"
                                placeholder="Marca"
                                value={d.brand}
                                onChange={(e) => updateDraft(p.id, { brand: e.target.value })}
                              />
                              <select
                                className="tbl-select"
                                value={d.category_id}
                                onChange={(e) => {
                                  const cat = categories.find((c) => c.id === e.target.value);
                                  updateDraft(p.id, {
                                    category_id: e.target.value,
                                    department: cat ? cat.department : d.department,
                                  });
                                }}
                              >
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </td>
                        <td data-label="Grupo de Precio (1 clic)">
                          <div className="tbl-stack">
                            <select
                              className="tbl-select"
                              aria-label={`Grupo de precio para ${p.sku}`}
                              value={d.price_preset_id}
                              onChange={(e) => handleRowPresetChange(p, e.target.value)}
                            >
                              <option value="">— Sin grupo (manual) —</option>
                              {pricePresets.map((pr) => (
                                <option key={pr.id} value={pr.id}>
                                  {formatPresetShort(pr)}
                                </option>
                              ))}
                            </select>
                            <div className="tbl-cost-box">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                className="tbl-input"
                                placeholder="Costo USD (+2/+3)"
                                value={displayCostVal}
                                onChange={(e) =>
                                  updateDraft(p.id, { costStr: e.target.value }, true)
                                }
                              />
                              {previewMarkup !== null && (
                                <small className="markup-hint">
                                  +${previewMarkup} USD auto
                                </small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td data-label="Precio Venta">
                          <div className="tbl-price-box">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              className="tbl-input tbl-input--num"
                              placeholder="Consultar"
                              value={d.priceStr}
                              onChange={(e) => updateDraft(p.id, { priceStr: e.target.value })}
                            />
                            <select
                              className="tbl-select tbl-select--curr"
                              value={d.currency}
                              onChange={(e) =>
                                updateDraft(p.id, { currency: e.target.value as Currency })
                              }
                            >
                              <option value="CUP">CUP</option>
                              <option value="USD">USD</option>
                            </select>
                          </div>
                        </td>
                        <td data-label="Tallas y Nota">
                          <div className="tbl-stack">
                            <input
                              type="text"
                              className="tbl-input"
                              placeholder="39, 40, 41"
                              value={d.sizesStr}
                              onChange={(e) => updateDraft(p.id, { sizesStr: e.target.value })}
                            />
                            {d.sizesStr
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean).length > 0 && (
                              <div className="tbl-size-toggles" title="Toca una talla para marcarla como agotada">
                                {d.sizesStr
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                                  .map((sz) => {
                                    const isOut = d.soldOutSizes.includes(sz);
                                    return (
                                      <button
                                        key={sz}
                                        type="button"
                                        className={`size-stock-pill${isOut ? ' is-out' : ''}`}
                                        onClick={() => toggleRowSoldOutSize(p, sz)}
                                        title={
                                          isOut
                                            ? `Talla ${sz} agotada (clic para reactivar)`
                                            : `Talla ${sz} disponible (clic para agotar)`
                                        }
                                      >
                                        {isOut ? `✕ ${sz}` : sz}
                                      </button>
                                    );
                                  })}
                              </div>
                            )}
                            <input
                              type="text"
                              className="tbl-input"
                              placeholder="Nota (ej. reducido -1)"
                              value={d.fit_note}
                              onChange={(e) => updateDraft(p.id, { fit_note: e.target.value })}
                            />
                          </div>
                        </td>
                        <td data-label="Estado">
                          <div className="tbl-stack">
                            <select
                              className={`tbl-select status-sel status-sel--${d.status}`}
                              value={d.status}
                              onChange={(e) =>
                                updateDraft(p.id, { status: e.target.value as ProductStatus })
                              }
                            >
                              <option value="active">Activo</option>
                              <option value="sold_out">Agotado</option>
                              <option value="hidden">Oculto</option>
                            </select>
                            <label className="chk-inline">
                              <input
                                type="checkbox"
                                checked={d.featured}
                                onChange={(e) =>
                                  updateDraft(p.id, { featured: e.target.checked })
                                }
                              />
                              <span>Destacado</span>
                            </label>
                          </div>
                        </td>
                        <td className="tbl-actions-cell">
                          <div className="tbl-actions">
                            <button
                              type="button"
                              className={`btn-save${d.dirty ? ' is-ready' : ''}`}
                              disabled={savingId === p.id}
                              onClick={() => handleSaveRow(p)}
                            >
                              <Save size={14} />
                              <span>{savingId === p.id ? '...' : 'Guardar'}</span>
                            </button>
                            <button
                              type="button"
                              className="btn-card-wa"
                              disabled={cardBusyId === p.id}
                              title="Descargar tarjeta para Estado de WhatsApp"
                              onClick={() => handleDownloadStatusCard(p)}
                            >
                              <ImageDown size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn-del-row"
                              title="Eliminar producto"
                              onClick={() => handleDeleteRow(p)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'orders' && (
          <section className="admin-panel">
            <div className="admin-panel-head">
              <h2>Pedidos enviados a WhatsApp</h2>
              <div className="admin-panel-head__btns">
                {orders.length > 0 && (
                  <button type="button" className="btn-outline" onClick={handleExportOrdersCsv}>
                    <Download size={15} /> Exportar CSV
                  </button>
                )}
                <button type="button" className="btn-outline" onClick={loadOrders}>
                  <RefreshCw size={15} /> Actualizar
                </button>
              </div>
            </div>

            {orders.length > 0 && (
              <div className="orders-summary-grid">
                <div className="kpi-card">
                  <span>Nuevos</span>
                  <strong>{orderMetrics.nuevo}</strong>
                </div>
                <div className="kpi-card">
                  <span>Confirmados</span>
                  <strong>{orderMetrics.confirmado}</strong>
                </div>
                <div className="kpi-card">
                  <span>Entregados</span>
                  <strong>{orderMetrics.entregado}</strong>
                </div>
                <div className="kpi-card kpi-card--accent">
                  <span>Vendido este mes</span>
                  <strong>{formatCup(orderMetrics.monthTotalCup)}</strong>
                  <small>≈ {formatUsd(orderMetrics.monthTotalUsd)}</small>
                </div>
              </div>
            )}
            {ordersLoading ? (
              <p className="muted-empty">Cargando pedidos...</p>
            ) : orders.length === 0 ? (
              <p className="muted-empty">Aún no hay pedidos registrados desde el carrito web.</p>
            ) : (
              <div className="orders-list">
                {orders.map((ord) => (
                  <article key={ord.id} className="order-card">
                    <div className="order-card__head">
                      <div>
                        <strong>{ord.order_code} · {ord.customer_name}</strong>
                        <span>
                          {new Date(ord.created_at).toLocaleString('es-ES')} · {ord.delivery_type === 'domicilio' ? `Domicilio (${ord.delivery_address})` : 'Recogida'}
                        </span>
                      </div>
                      <select
                        className={`tbl-select status-sel status-sel--${ord.status}`}
                        value={ord.status}
                        onChange={(e) =>
                          handleOrderStatus(ord.id, e.target.value as OrderStatus)
                        }
                      >
                        <option value="nuevo">Nuevo</option>
                        <option value="confirmado">Confirmado</option>
                        <option value="entregado">Entregado</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </div>

                    <ul className="order-items">
                      {ord.items.map((it, idx) => {
                        const matched = products.find((p) => p.sku === it.sku);
                        const itemPhoto = resolveProductImageUrl(
                          it.sku,
                          it.image_url || matched?.image_url
                        );
                        return (
                          <li key={idx} className="order-item-row">
                            <a
                              href={itemPhoto}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Ver foto de ${it.sku}`}
                              className="order-item-thumb"
                            >
                              <img src={itemPhoto} alt={it.title} />
                            </a>
                            <span className="order-item-text">
                              {it.qty}x [{it.sku}] {it.title} (Talla {it.size}) —{' '}
                              {it.unit_price !== null
                                ? it.currency === 'USD'
                                  ? formatUsd(it.unit_price * it.qty)
                                  : formatCup(it.unit_price * it.qty)
                                : 'Por confirmar'}
                            </span>
                            <button
                              type="button"
                              className="order-item-dl"
                              title={`Descargar foto ${it.sku}`}
                              onClick={() => downloadRemoteImage(itemPhoto, `${it.sku}.webp`)}
                            >
                              <Download size={13} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="order-card__foot">
                      <div>
                        <strong>
                          Subtotal: {formatCup(ord.subtotal_cup)}
                          {ord.delivery_fee_cup > 0 ? ` + ${formatCup(ord.delivery_fee_cup)} domicilio` : ''}
                        </strong>
                        {ord.notes && <span>Nota: {ord.notes}</span>}
                      </div>
                      <div className="order-card__actions">
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={async () => {
                            const transferFeeCup =
                              ord.payment_method === 'transferencia'
                                ? Math.round((ord.subtotal_cup * settings.transfer_surcharge_pct) / 100)
                                : 0;
                            const enrichedItems = ord.items.map((it) => ({
                              ...it,
                              image_url:
                                it.image_url || products.find((p) => p.sku === it.sku)?.image_url,
                            }));
                            const txt = formatWhatsAppOrderText({
                              orderCode: ord.order_code,
                              customerName: ord.customer_name,
                              customerPhone: ord.customer_phone,
                              deliveryType: ord.delivery_type,
                              deliveryAddress: ord.delivery_address,
                              paymentMethod: ord.payment_method,
                              notes: ord.notes,
                              items: enrichedItems,
                              summary: {
                                subtotalCup: ord.subtotal_cup,
                                subtotalUsd: ord.subtotal_usd,
                                deliveryFeeCup: ord.delivery_fee_cup,
                                transferFeeCup,
                                totalCupWithExtras:
                                  ord.subtotal_cup + ord.delivery_fee_cup + transferFeeCup,
                                hasUnpricedItems: ord.has_unpriced_items,
                              },
                              settings,
                              includeManager: true,
                            });
                            try {
                              await navigator.clipboard.writeText(txt);
                              showToast(`Ficha ${ord.order_code} copiada (con Gestor: yolexsis)`);
                            } catch {
                              showToast('No se pudo copiar al portapapeles');
                            }
                          }}
                        >
                          <Copy size={14} /> Copiar ficha (Gestor)
                        </button>
                        <a
                          href={buildWhatsAppUrl(
                            null,
                            formatWhatsAppOrderText({
                              orderCode: ord.order_code,
                              customerName: ord.customer_name,
                              customerPhone: ord.customer_phone,
                              deliveryType: ord.delivery_type,
                              deliveryAddress: ord.delivery_address,
                              paymentMethod: ord.payment_method,
                              notes: ord.notes,
                              items: ord.items.map((it) => ({
                                ...it,
                                image_url:
                                  it.image_url || products.find((p) => p.sku === it.sku)?.image_url,
                              })),
                              summary: {
                                subtotalCup: ord.subtotal_cup,
                                subtotalUsd: ord.subtotal_usd,
                                deliveryFeeCup: ord.delivery_fee_cup,
                                transferFeeCup:
                                  ord.payment_method === 'transferencia'
                                    ? Math.round((ord.subtotal_cup * settings.transfer_surcharge_pct) / 100)
                                    : 0,
                                totalCupWithExtras: ord.subtotal_cup + ord.delivery_fee_cup,
                                hasUnpricedItems: ord.has_unpriced_items,
                              },
                              settings,
                              includeManager: true,
                            })
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-outline"
                        >
                          <MessageCircle size={14} /> Reenviar ficha
                        </a>
                        {ord.customer_phone && (
                          <a
                            href={buildWhatsAppUrl(normalizeWhatsAppDigits(ord.customer_phone))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-outline"
                          >
                            Escribir al cliente
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'settings' && (
          <section className="admin-panel">
            <h2>Configuración de {cfg.store_name}</h2>
            <form className="settings-grid" onSubmit={handleSaveSettings}>
              <label className="field">
                <span>Nombre comercial</span>
                <input
                  type="text"
                  value={cfg.store_name}
                  onChange={(e) => setCfg({ ...cfg, store_name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>WhatsApp receptor (sin +)</span>
                <input
                  type="text"
                  value={cfg.whatsapp_number}
                  onChange={(e) => setCfg({ ...cfg, whatsapp_number: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Ubicación pública</span>
                <input
                  type="text"
                  value={cfg.location_text}
                  onChange={(e) => setCfg({ ...cfg, location_text: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Tasa de cambio (1 USD en CUP)</span>
                <input
                  type="number"
                  value={cfg.usd_to_cup_rate}
                  onChange={(e) =>
                    setCfg({ ...cfg, usd_to_cup_rate: Number(e.target.value) || 980 })
                  }
                />
              </label>
              <label className="field">
                <span>Tarifa domicilio base (CUP)</span>
                <input
                  type="number"
                  value={cfg.delivery_fee_cup}
                  onChange={(e) =>
                    setCfg({ ...cfg, delivery_fee_cup: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label className="field">
                <span>Recargo transferencia (%)</span>
                <input
                  type="number"
                  value={cfg.transfer_surcharge_pct}
                  onChange={(e) =>
                    setCfg({ ...cfg, transfer_surcharge_pct: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label className="field">
                <span>Regla Shein menor a $20 USD (+$)</span>
                <input
                  type="number"
                  value={cfg.shein_under_20_markup}
                  onChange={(e) =>
                    setCfg({ ...cfg, shein_under_20_markup: Number(e.target.value) || 2 })
                  }
                />
              </label>
              <label className="field">
                <span>Regla Shein $20+ PAR (+$)</span>
                <input
                  type="number"
                  value={cfg.shein_even_20_plus_markup}
                  onChange={(e) =>
                    setCfg({ ...cfg, shein_even_20_plus_markup: Number(e.target.value) || 2 })
                  }
                />
              </label>
              <label className="field">
                <span>Regla Shein $20+ IMPAR (+$)</span>
                <input
                  type="number"
                  value={cfg.shein_odd_20_plus_markup}
                  onChange={(e) =>
                    setCfg({ ...cfg, shein_odd_20_plus_markup: Number(e.target.value) || 3 })
                  }
                />
              </label>
              <label className="field field--full">
                <span>Título portada (Hero)</span>
                <input
                  type="text"
                  value={cfg.hero_title}
                  onChange={(e) => setCfg({ ...cfg, hero_title: e.target.value })}
                />
              </label>
              <label className="field field--full">
                <span>Subtítulo portada</span>
                <textarea
                  rows={2}
                  value={cfg.hero_subtitle}
                  onChange={(e) => setCfg({ ...cfg, hero_subtitle: e.target.value })}
                />
              </label>
              <label className="field field--full">
                <span>Aviso de compra / devoluciones</span>
                <textarea
                  rows={2}
                  value={cfg.no_returns_notice}
                  onChange={(e) => setCfg({ ...cfg, no_returns_notice: e.target.value })}
                />
              </label>
              <label className="chk-inline field--full">
                <input
                  type="checkbox"
                  checked={cfg.show_sold_out_public}
                  onChange={(e) =>
                    setCfg({ ...cfg, show_sold_out_public: e.target.checked })
                  }
                />
                <span>Mostrar artículos agotados en el catálogo público (con etiqueta Agotado)</span>
              </label>

              <div className="field--full">
                <button type="submit" className="btn btn--primary" disabled={savingCfg}>
                  <Save size={16} />
                  <span>{savingCfg ? 'Guardando...' : 'Guardar configuración'}</span>
                </button>
              </div>
            </form>
          </section>
        )}

        {tab === 'security' && (
          <section className="admin-panel">
            <h2>Cambiar contraseña de administrador</h2>
            <form className="settings-grid" style={{ maxWidth: 460 }} onSubmit={handleChangePassword}>
              <label className="field field--full">
                <span>Nueva contraseña (mínimo 8 caracteres)</span>
                <input
                  type="password"
                  required
                  value={newPass1}
                  onChange={(e) => setNewPass1(e.target.value)}
                />
              </label>
              <label className="field field--full">
                <span>Repite la nueva contraseña</span>
                <input
                  type="password"
                  required
                  value={newPass2}
                  onChange={(e) => setNewPass2(e.target.value)}
                />
              </label>
              {passMsg && <p className="field--full">{passMsg}</p>}
              <div className="field--full">
                <button type="submit" className="btn btn--primary">
                  Actualizar contraseña
                </button>
              </div>
            </form>
          </section>
        )}
      </main>

      {newOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setNewOpen(false)}>
          <div className="modal-card modal-card--sm" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setNewOpen(false)}>
              <X size={20} />
            </button>
            <h2 style={{ marginBottom: 14 }}>Nuevo producto</h2>
            <form className="settings-grid" onSubmit={handleCreateProduct}>
              <label className="field field--full">
                <span>Imagen del producto (se optimiza automáticamente a WebP) *</span>
                <input
                  type="file"
                  accept="image/*"
                  required
                  onChange={(e) => handleNewFileChange(e.target.files?.[0] || null)}
                />
                {newPreviewInfo && <small className="markup-hint">{newPreviewInfo}</small>}
              </label>
              <label className="field field--full">
                <span>
                  <Sparkles size={13} style={{ verticalAlign: 'middle' }} /> Grupo de precio (carga rápida opcional)
                </span>
                <select
                  value={newPresetId}
                  onChange={(e) => handleSelectNewProductPreset(e.target.value)}
                >
                  <option value="">— Precio manual —</option>
                  {pricePresets.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {formatPresetShort(pr)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field--full">
                <span>Nombre del producto *</span>
                <input
                  type="text"
                  required
                  placeholder="Ej. Gafas Sol Negras / Sandalia Hermès"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Marca</span>
                <input
                  type="text"
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Departamento</span>
                <select
                  value={newDept}
                  onChange={(e) => {
                    const dep = e.target.value as Department;
                    setNewDept(dep);
                    const firstCat = categories.find((c) => c.department === dep);
                    if (firstCat) setNewCat(firstCat.id);
                  }}
                >
                  {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((k) => (
                    <option key={k} value={k}>
                      {DEPARTMENT_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Categoría</span>
                <select value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Calidad / Etiqueta</span>
                <input
                  type="text"
                  placeholder="3A, G5, SHEIN..."
                  value={newQuality}
                  onChange={(e) => setNewQuality(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Moneda</span>
                <select
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value as Currency)}
                >
                  <option value="USD">USD</option>
                  <option value="CUP">CUP</option>
                </select>
              </label>
              <label className="field">
                <span>Costo USD (opcional, calcula +2/+3)</span>
                <input
                  type="number"
                  step="0.5"
                  value={newCost}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNewCost(v);
                    const n = parseFloat(v);
                    if (Number.isFinite(n) && n > 0) {
                      setNewCurrency('USD');
                      setNewPrice(String(calcYoleSheinPrice(n, cfg)));
                    }
                  }}
                />
              </label>
              <label className="field">
                <span>Precio venta</span>
                <input
                  type="number"
                  step="any"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Tallas (separadas por coma)</span>
                <input
                  type="text"
                  value={newSizes}
                  onChange={(e) => setNewSizes(e.target.value)}
                />
              </label>
              <label className="field field--full">
                <span>Nota adicional</span>
                <input
                  type="text"
                  placeholder="Ej. Horma reducida (-1), Último par..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
              </label>
              <div className="field--full">
                <button type="submit" className="btn btn--primary btn--block" disabled={creatingNew}>
                  {creatingNew ? 'Optimizando WebP y publicando...' : 'Publicar producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
