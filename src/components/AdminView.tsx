import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowLeft,
  Check,
  Download,
  ImagePlus,
  Lock,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  Category,
  Currency,
  Department,
  Order,
  OrderStatus,
  Product,
  ProductStatus,
  StoreSettings,
} from '../types';
import { DEPARTMENT_LABELS } from '../types';
import {
  calcYoleSheinPrice,
  formatCup,
  formatUsd,
  normalizeWhatsAppDigits,
} from '../lib/pricing';
import { formatKb, optimizeImageToWebP } from '../lib/imageOptimizer';
import {
  deleteProduct,
  fetchOrders,
  saveProduct,
  saveStoreSettings,
  updateOrderStatus,
  uploadProductWebP,
} from '../lib/catalog';
import { supabase } from '../lib/supabase';

interface AdminViewProps {
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
  onRefresh: () => Promise<void>;
  onBackToStore: () => void;
}

type AdminTab = 'products' | 'orders' | 'settings' | 'security';
type QuickFilter = 'all' | 'unpriced' | 'calzado' | 'moda_shein' | 'hombre' | 'accesorios' | 'sold_out' | 'hidden';

interface RowDraft {
  title: string;
  brand: string;
  costStr: string;
  priceStr: string;
  currency: Currency;
  sizesStr: string;
  fit_note: string;
  status: ProductStatus;
  featured: boolean;
  category_id: string;
  department: Department;
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
    fit_note: p.fit_note,
    status: p.status,
    featured: p.featured,
    category_id: p.category_id,
    department: p.department,
    dirty: false,
  };
}

export function AdminView({
  settings,
  categories,
  products,
  onRefresh,
  onBackToStore,
}: AdminViewProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('studio.lexair@gmail.com');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [tab, setTab] = useState<AdminTab>('products');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

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
    setTimeout(() => setToast(''), 3200);
  };

  useEffect(() => {
    setCfg(settings);
  }, [settings]);

  useEffect(() => {
    const map: Record<string, RowDraft> = {};
    for (const p of products) {
      map[p.id] = makeDraft(p);
    }
    setDrafts(map);
  }, [products]);

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
      if (q) {
        const hay = `${p.sku} ${p.title} ${p.brand} ${p.quality}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, quickFilter, search]);

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
        quality: p.quality,
        currency: d.currency,
        cost_price: Number.isFinite(costNum as number) ? costNum : null,
        price: Number.isFinite(priceNum as number) ? priceNum : null,
        sizes: sizesArr,
        fit_note: d.fit_note.trim(),
        image_url: p.image_url,
        image_path: p.image_path,
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
    const header = ['SKU', 'Titulo', 'Marca', 'Departamento', 'Categoria', 'Calidad', 'Moneda', 'Costo', 'Venta', 'Tallas', 'Estado', 'Imagen'];
    const rows = products.map((p) => [
      p.sku,
      `"${p.title.replace(/"/g, '""')}"`,
      p.brand,
      p.department,
      p.category_id,
      p.quality,
      p.currency,
      p.cost_price ?? '',
      p.price ?? '',
      `"${p.sizes.join(', ')}"`,
      p.status,
      p.image_url,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yole-shop-catalogo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

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
            <div className="admin-lock-badge">
              <Lock size={22} />
            </div>
            <h1>Panel Admin · {settings.store_name}</h1>
            <p>Gestiona productos, precios Shein (+2/+3 USD), fotos WebP y pedidos WhatsApp.</p>
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
          <div className="kpi-card kpi-card--warn">
            <span>Sin precio (pendiente Shein/acc.)</span>
            <strong>{kpis.unpriced}</strong>
          </div>
          <div className="kpi-card">
            <span>Agotados</span>
            <strong>{kpis.soldOut}</strong>
          </div>
          <div className="kpi-card">
            <span>Tasa USD actual</span>
            <strong>{formatCup(cfg.usd_to_cup_rate)}</strong>
          </div>
        </section>

        {tab === 'products' && (
          <section className="admin-panel">
            <div className="admin-toolbar">
              <div className="admin-toolbar__filters">
                {(
                  [
                    ['all', `Todos (${kpis.total})`],
                    ['unpriced', `Sin precio (${kpis.unpriced})`],
                    ['calzado', 'Calzado'],
                    ['moda_shein', 'Moda Shein'],
                    ['hombre', 'Hombre'],
                    ['accesorios', 'Carteras/Relojes'],
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

            <div className="rule-banner">
              <Sparkles size={16} />
              <span>
                <strong>Regla automática Yole Shop (USD):</strong> escribe el <strong>Costo USD</strong> y el sistema calcula la venta automáticamente: menor a $20 → <strong>+${cfg.shein_under_20_markup}</strong> · $20+ par → <strong>+${cfg.shein_even_20_plus_markup}</strong> (ej. 28→30) · $20+ impar → <strong>+${cfg.shein_odd_20_plus_markup}</strong> (ej. 25→28).
              </span>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Foto / SKU</th>
                    <th>Producto y Categoría</th>
                    <th>Costo USD (auto +2/+3)</th>
                    <th>Precio Venta</th>
                    <th>Tallas</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const d = drafts[p.id] || makeDraft(p);
                    const costNum = parseFloat(d.costStr);
                    const previewMarkup =
                      Number.isFinite(costNum) && costNum > 0
                        ? calcYoleSheinPrice(costNum, cfg) - costNum
                        : null;
                    return (
                      <tr key={p.id} className={d.dirty ? 'is-dirty' : ''}>
                        <td>
                          <div className="tbl-photo-cell">
                            <img src={p.image_url} alt={p.sku} loading="lazy" />
                            <div>
                              <strong>{p.sku}</strong>
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
                            </div>
                          </div>
                        </td>
                        <td>
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
                        <td>
                          <div className="tbl-cost-box">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              className="tbl-input tbl-input--num"
                              placeholder="Costo $"
                              value={d.costStr}
                              onChange={(e) =>
                                updateDraft(p.id, { costStr: e.target.value }, true)
                              }
                            />
                            {previewMarkup !== null && (
                              <small className="markup-hint">
                                +${previewMarkup} USD automático
                              </small>
                            )}
                          </div>
                        </td>
                        <td>
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
                        <td>
                          <div className="tbl-stack">
                            <input
                              type="text"
                              className="tbl-input"
                              placeholder="39, 40, 41"
                              value={d.sizesStr}
                              onChange={(e) => updateDraft(p.id, { sizesStr: e.target.value })}
                            />
                            <input
                              type="text"
                              className="tbl-input"
                              placeholder="Nota (ej. reducido -1)"
                              value={d.fit_note}
                              onChange={(e) => updateDraft(p.id, { fit_note: e.target.value })}
                            />
                          </div>
                        </td>
                        <td>
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
                        <td>
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
              <button type="button" className="btn-outline" onClick={loadOrders}>
                <RefreshCw size={15} /> Actualizar
              </button>
            </div>
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
                      {ord.items.map((it, idx) => (
                        <li key={idx}>
                          {it.qty}x [{it.sku}] {it.title} (Talla {it.size}) —{' '}
                          {it.unit_price !== null
                            ? it.currency === 'USD'
                              ? formatUsd(it.unit_price * it.qty)
                              : formatCup(it.unit_price * it.qty)
                            : 'Por confirmar'}
                        </li>
                      ))}
                    </ul>

                    <div className="order-card__foot">
                      <div>
                        <strong>
                          Subtotal: {formatCup(ord.subtotal_cup)}
                          {ord.delivery_fee_cup > 0 ? ` + ${formatCup(ord.delivery_fee_cup)} domicilio` : ''}
                        </strong>
                        {ord.notes && <span>Nota: {ord.notes}</span>}
                      </div>
                      {ord.customer_phone && (
                        <a
                          href={`https://wa.me/${normalizeWhatsAppDigits(ord.customer_phone)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-outline"
                        >
                          Escribir al cliente
                        </a>
                      )}
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
                    setCfg({ ...cfg, usd_to_cup_rate: Number(e.target.value) || 920 })
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
                <span>Nombre del producto *</span>
                <input
                  type="text"
                  required
                  placeholder="Ej. Vestido Satén Vino Encaje"
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
                <span>Costo USD (calcula +2/+3)</span>
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
