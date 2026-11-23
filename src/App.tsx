import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  Download,
  Flame,
  Heart,
  Lock,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type {
  CartItem,
  Category,
  Currency,
  Department,
  PricePreset,
  Product,
  StoreSettings,
} from './types';
import { DEFAULT_SETTINGS, DEPARTMENT_LABELS } from './types';
import {
  collectAvailableSizes,
  fetchStoreData,
  filterProducts,
  pushRecentSku,
  readCachedStoreData,
  readFavoriteSkus,
  readRecentSkus,
  readThemeMode,
  writeCachedStoreData,
  writeFavoriteSkus,
  writeThemeMode,
  type DepartmentFilter,
  type PriceRangeFilter,
  type SortMode,
  type ThemeMode,
} from './lib/catalog';
import { buildWhatsAppUrl, formatCup, getDisplayPrice, normalizeWhatsAppDigits } from './lib/pricing';
import { SUPABASE_URL, STORAGE_BUCKET } from './lib/supabase';
import { ProductCard } from './components/ProductCard';
import { ProductModal } from './components/ProductModal';
import { CartDrawer } from './components/CartDrawer';
import { SplashLoader } from './components/SplashLoader';
import { FloatingCartButton } from './components/FloatingCartButton';
import { BottomMenuSheet } from './components/BottomMenuSheet';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const AdminView = lazy(() =>
  import('./components/AdminView').then((m) => ({ default: m.AdminView }))
);

const CART_STORAGE_KEY = 'yole_shop_cart_v1';
const PAGE_STEP = 36;

function isAdminPath(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname.replace(/\/+$/, '') === '/admin' ||
    window.location.hash === '#admin'
  );
}

export function App() {
  const initialCache = useMemo(() => readCachedStoreData(), []);

  const [settings, setSettings] = useState<StoreSettings>(
    () => initialCache?.settings || DEFAULT_SETTINGS
  );
  const [categories, setCategories] = useState<Category[]>(
    () => initialCache?.categories || []
  );
  const [products, setProducts] = useState<Product[]>(
    () => initialCache?.products || []
  );
  const [pricePresets, setPricePresets] = useState<PricePreset[]>(
    () => initialCache?.pricePresets || []
  );
  const [loading, setLoading] = useState(() => !initialCache);
  const [minSplashDone, setMinSplashDone] = useState(
    () => Boolean(initialCache) || import.meta.env.MODE === 'test'
  );
  const [splashMounted, setSplashMounted] = useState(
    () => !initialCache && import.meta.env.MODE !== 'test'
  );
  const [loadError, setLoadError] = useState('');

  const [isAdmin, setIsAdmin] = useState<boolean>(isAdminPath);
  const [department, setDepartment] = useState<Department | 'all'>('all');
  const [sheinGender, setSheinGender] = useState<'all' | 'mujer' | 'hombre'>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [sizeFilter, setSizeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [onlyPriced, setOnlyPriced] = useState(false);
  const [priceRange, setPriceRange] = useState<PriceRangeFilter>('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favoriteSkus, setFavoriteSkus] = useState<string[]>(() => readFavoriteSkus());
  const [recentSkus, setRecentSkus] = useState<string[]>(() => readRecentSkus());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode());
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [sort, setSort] = useState<SortMode>('featured');
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('CUP');
  const [visibleLimit, setVisibleLimit] = useState(PAGE_STEP);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  });
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [addedToast, setAddedToast] = useState<{ text: string; imageUrl: string } | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = themeMode;
    }
    writeThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 460);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore quota
    }
  }, [cart]);

  useEffect(() => {
    const onPop = () => setIsAdmin(isAdminPath());
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  const refreshData = useCallback(async () => {
    const hasLocalCatalog =
      products.length > 0 || Boolean(readCachedStoreData()?.products?.length);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setLoading(false);
      return;
    }

    if (!hasLocalCatalog) {
      setLoadError('');
    }

    try {
      const data = await fetchStoreData();
      setSettings(data.settings);
      setCategories(data.categories);
      setProducts(data.products);
      setPricePresets(data.pricePresets || []);
      setLoadError('');
      if (import.meta.env.MODE !== 'test') {
        writeCachedStoreData(data);
      }
    } catch (err) {
      // Offline-first silencioso: si ya tenemos caché local, mantenemos el catálogo sin mostrar carteles de error
      if (!hasLocalCatalog) {
        setLoadError(
          err instanceof Error ? err.message : 'No se pudo conectar con el catálogo.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [products.length]);

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    const onOnline = () => {
      refreshData();
    };
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [refreshData]);

  const handleInstallApp = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!installPrompt) return 'unavailable';
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
      setIsInstalled(true);
    }
    return outcome;
  };

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    const t = setTimeout(() => setMinSplashDone(true), 750);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!loading && minSplashDone) {
      const t = setTimeout(() => setSplashMounted(false), 380);
      return () => clearTimeout(t);
    }
  }, [loading, minSplashDone]);

  const navigateAdmin = (enter: boolean) => {
    if (enter) {
      window.history.pushState({}, '', '/admin');
      setIsAdmin(true);
    } else {
      window.history.pushState({}, '', '/');
      setIsAdmin(false);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deptCounts = useMemo(() => {
    const counts = { all: 0, calzado: 0, moda_shein: 0, hombre: 0, accesorios: 0 };
    for (const p of products) {
      if (p.status === 'hidden') continue;
      if (!settings.show_sold_out_public && p.status === 'sold_out') continue;
      counts.all += 1;
      counts[p.department] += 1;
    }
    return counts;
  }, [products, settings.show_sold_out_public]);

  const activeDeptFilter: DepartmentFilter = useMemo(() => {
    if (department === 'moda_shein') {
      if (sheinGender === 'mujer') return 'moda_shein';
      if (sheinGender === 'hombre') return 'hombre';
      return 'shein_all';
    }
    return department;
  }, [department, sheinGender]);

  const visibleCategories = useMemo(() => {
    if (department === 'all') return categories;
    if (department === 'moda_shein') {
      if (sheinGender === 'mujer') return categories.filter((c) => c.department === 'moda_shein');
      if (sheinGender === 'hombre') return categories.filter((c) => c.department === 'hombre');
      return categories.filter(
        (c) => c.department === 'moda_shein' || c.department === 'hombre'
      );
    }
    return categories.filter((c) => c.department === department);
  }, [categories, department, sheinGender]);

  const deptScopedProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.status === 'hidden') return false;
      if (!settings.show_sold_out_public && p.status === 'sold_out') return false;
      if (activeDeptFilter === 'shein_all') {
        if (p.department !== 'moda_shein' && p.department !== 'hombre') return false;
      } else if (activeDeptFilter !== 'all' && p.department !== activeDeptFilter) {
        return false;
      }
      if (categoryId !== 'all' && p.category_id !== categoryId) return false;
      return true;
    });
  }, [products, settings.show_sold_out_public, activeDeptFilter, categoryId]);

  const availableSizes = useMemo(
    () => collectAvailableSizes(deptScopedProducts),
    [deptScopedProducts]
  );

  const favoriteSet = useMemo(() => new Set(favoriteSkus), [favoriteSkus]);

  const toggleFavoriteSku = useCallback((sku: string) => {
    setFavoriteSkus((prev) => {
      const next = prev.includes(sku) ? prev.filter((s) => s !== sku) : [sku, ...prev];
      writeFavoriteSkus(next);
      return next;
    });
  }, []);

  const openProductModal = useCallback((product: Product) => {
    setSelectedProduct(product);
    setRecentSkus(pushRecentSku(product.sku));
    if (typeof window !== 'undefined' && !isAdminPath()) {
      const url = new URL(window.location.href);
      url.searchParams.set('sku', product.sku);
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  }, []);

  const closeProductModal = useCallback(() => {
    setSelectedProduct(null);
    if (typeof window !== 'undefined' && !isAdminPath()) {
      const url = new URL(window.location.href);
      if (url.searchParams.has('sku')) {
        url.searchParams.delete('sku');
        const nextUrl = url.searchParams.toString()
          ? `${url.pathname}?${url.searchParams.toString()}`
          : url.pathname;
        window.history.replaceState({}, '', nextUrl);
      }
    }
  }, []);

  const recentProducts = useMemo(() => {
    const bySku = new Map(products.map((p) => [p.sku, p]));
    return recentSkus
      .map((sku) => bySku.get(sku))
      .filter(
        (p): p is Product =>
          Boolean(p) &&
          p!.status !== 'hidden' &&
          (settings.show_sold_out_public || p!.status !== 'sold_out')
      )
      .slice(0, 8);
  }, [products, recentSkus, settings.show_sold_out_public]);

  const topFeaturedProducts = useMemo(
    () =>
      products
        .filter((p) => p.featured && p.status === 'active')
        .slice(0, 14),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const base = filterProducts(
      products,
      {
        department: activeDeptFilter,
        categoryId,
        size: sizeFilter,
        search,
        onlyPriced,
        priceRange,
        includeSoldOut: settings.show_sold_out_public,
        sort,
      },
      settings.usd_to_cup_rate
    );
    if (!onlyFavorites) return base;
    return base.filter((p) => favoriteSet.has(p.sku));
  }, [
    products,
    activeDeptFilter,
    categoryId,
    sizeFilter,
    search,
    onlyPriced,
    priceRange,
    onlyFavorites,
    favoriteSet,
    settings.show_sold_out_public,
    sort,
    settings.usd_to_cup_rate,
  ]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleLimit),
    [filteredProducts, visibleLimit]
  );

  const handleSelectDept = (nextDept: Department | 'all') => {
    setDepartment(nextDept);
    setSheinGender('all');
    setCategoryId('all');
    setSizeFilter('all');
    setOnlyFavorites(false);
    setVisibleLimit(PAGE_STEP);
  };

  const handleSelectSheinGender = (nextGender: 'all' | 'mujer' | 'hombre') => {
    setSheinGender(nextGender);
    setCategoryId('all');
    setSizeFilter('all');
    setVisibleLimit(PAGE_STEP);
  };

  const handleAddToCart = (product: Product, size: string) => {
    const cleanSize = size || product.sizes[0] || 'Única';
    setCart((prev) => {
      const idx = prev.findIndex(
        (it) => it.product.sku === product.sku && it.size === cleanSize
      );
      if (idx >= 0) {
        return prev.map((it, i) => (i === idx ? { ...it, qty: it.qty + 1 } : it));
      }
      return [...prev, { product, size: cleanSize, qty: 1 }];
    });
    setAddedToast({
      text: `${product.title} (${cleanSize})`,
      imageUrl: product.image_url,
    });
    setTimeout(() => setAddedToast(null), 2400);
  };

  const handleUpdateQty = (sku: string, size: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((it) =>
          it.product.sku === sku && it.size === size
            ? { ...it, qty: it.qty + delta }
            : it
        )
        .filter((it) => it.qty > 0)
    );
  };

  const handleRemoveItem = (sku: string, size: string) => {
    setCart((prev) =>
      prev.filter((it) => !(it.product.sku === sku && it.size === size))
    );
  };

  const totalUnits = cart.reduce((acc, it) => acc + it.qty, 0);
  const directWaUrl = buildWhatsAppUrl(
    normalizeWhatsAppDigits(settings.whatsapp_number),
    `Hola ${settings.store_name}, quiero consultar sobre los productos del catálogo.`
  );

  const deepLinkHandledRef = useRef(false);

  useEffect(() => {
    if (deepLinkHandledRef.current || typeof window === 'undefined' || products.length === 0) {
      return;
    }
    const skuParam = new URLSearchParams(window.location.search).get('sku');
    if (!skuParam) {
      deepLinkHandledRef.current = true;
      return;
    }
    const found = products.find(
      (p) => p.sku.toLowerCase() === skuParam.trim().toLowerCase()
    );
    if (found) {
      deepLinkHandledRef.current = true;
      setSelectedProduct(found);
    }
  }, [products]);

  // Banners visuales directos con imágenes reales del catálogo
  const bannerImg = (sku: string, fallbackDept: Department) =>
    products.find((p) => p.sku === sku)?.image_url ||
    products.find((p) => p.department === fallbackDept)?.image_url ||
    `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/catalog/${sku}.webp`;

  if (isAdmin) {
    return (
      <Suspense fallback={<SplashLoader visible label="Cargando panel administrador..." />}>
        <AdminView
          settings={settings}
          categories={categories}
          products={products}
          pricePresets={pricePresets}
          onRefresh={refreshData}
          onBackToStore={() => navigateAdmin(false)}
        />
      </Suspense>
    );
  }

  return (
    <div className="app-shell">
      {splashMounted && (
        <SplashLoader
          visible={loading || !minSplashDone}
          label={loading ? 'Cargando catálogo...' : 'Colección lista'}
        />
      )}
      {/* Top Bar */}
      <div className="promo-strip">
        <div className="container promo-strip__inner">
          <span>
            <MapPin size={12} /> {settings.location_text}
          </span>
          <span className="promo-strip__sep">·</span>
          <span>Domicilio base {formatCup(settings.delivery_fee_cup)}</span>
          <span className="promo-strip__sep">·</span>
          <span>1 USD = {formatCup(settings.usd_to_cup_rate)}</span>
        </div>
      </div>

      {/* Main Header */}
      <header className="site-header">
        <div className="container header-row">
          <a
            href="/"
            className="brand-mark"
            onClick={(e) => {
              e.preventDefault();
              handleSelectDept('all');
            }}
          >
            <span className="brand-monogram">YS</span>
            <div>
              <strong>{settings.store_name.toUpperCase()}</strong>
              <small>Calzado &amp; Moda</small>
            </div>
          </a>

          <nav className="dept-nav" aria-label="Departamentos">
            <button
              type="button"
              className={department === 'all' ? 'is-active' : ''}
              onClick={() => handleSelectDept('all')}
            >
              Todo <span className="nav-count">{deptCounts.all}</span>
            </button>
            <button
              type="button"
              className={department === 'calzado' ? 'is-active' : ''}
              onClick={() => handleSelectDept('calzado')}
            >
              {DEPARTMENT_LABELS.calzado} <span className="nav-count">{deptCounts.calzado}</span>
            </button>
            <button
              type="button"
              className={department === 'moda_shein' ? 'is-active' : ''}
              onClick={() => handleSelectDept('moda_shein')}
            >
              {DEPARTMENT_LABELS.moda_shein}{' '}
              <span className="nav-count">{deptCounts.moda_shein + deptCounts.hombre}</span>
            </button>
            <button
              type="button"
              className={department === 'accesorios' ? 'is-active' : ''}
              onClick={() => handleSelectDept('accesorios')}
            >
              {DEPARTMENT_LABELS.accesorios}{' '}
              <span className="nav-count">{deptCounts.accesorios}</span>
            </button>
          </nav>

          <div className="header-actions">
            <div className="curr-toggle" role="group" aria-label="Moneda de visualización">
              <button
                type="button"
                className={displayCurrency === 'CUP' ? 'is-active' : ''}
                onClick={() => setDisplayCurrency('CUP')}
              >
                CUP
              </button>
              <button
                type="button"
                className={displayCurrency === 'USD' ? 'is-active' : ''}
                onClick={() => setDisplayCurrency('USD')}
              >
                USD
              </button>
            </div>

            <button
              type="button"
              className="cart-btn"
              onClick={() => setCartOpen(true)}
              aria-label="Abrir carrito"
            >
              <ShoppingBag size={17} />
              <span className="cart-btn__label">Carrito</span>
              {totalUnits > 0 && <span className="cart-badge">{totalUnits}</span>}
            </button>

            <button
              type="button"
              className="menu-trigger-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú"
              title="Menú e instalar app"
            >
              <Menu size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Compact Editorial Category Banners — directo al producto */}
      <section className="hero-compact" aria-label="Colecciones principales">
        <div className="container">
          <div className="hero-headline-row">
            <div>
              <h1>{settings.store_name}</h1>
              <p>{settings.hero_title}</p>
            </div>
            <div className="hero-headline-actions">
              {installPrompt && !isInstalled && (
                <button
                  type="button"
                  className="btn btn--outline-dark btn--sm"
                  onClick={handleInstallApp}
                >
                  <Download size={15} />
                  <span>Instalar App</span>
                </button>
              )}
              <a
                href={directWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--whatsapp btn--sm"
              >
                <MessageCircle size={16} />
                <span>WhatsApp directo</span>
              </a>
            </div>
          </div>

          <div className="banners-grid">
            <button
              type="button"
              className={`col-banner${department === 'calzado' ? ' is-selected' : ''}`}
              onClick={() => handleSelectDept('calzado')}
            >
              <img src={bannerImg('YOL-029', 'calzado')} alt="Calzado y Tenis" />
              <div className="col-banner__overlay">
                <span className="col-banner__tag">Calidades 3A &amp; G5</span>
                <strong>Tenis &amp; Calzado ({deptCounts.calzado})</strong>
                <span className="col-banner__cta">
                  Ver tallas <ArrowRight size={14} />
                </span>
              </div>
            </button>

            <button
              type="button"
              className={`col-banner${department === 'moda_shein' ? ' is-selected' : ''}`}
              onClick={() => handleSelectDept('moda_shein')}
            >
              <img src={bannerImg('YOL-122', 'moda_shein')} alt="Moda Shein Mujer y Hombre" />
              <div className="col-banner__overlay">
                <span className="col-banner__tag">Mujer &amp; Hombre</span>
                <strong>Moda Shein ({deptCounts.moda_shein + deptCounts.hombre})</strong>
                <span className="col-banner__cta">
                  Explorar <ArrowRight size={14} />
                </span>
              </div>
            </button>

            <button
              type="button"
              className={`col-banner${department === 'accesorios' ? ' is-selected' : ''}`}
              onClick={() => handleSelectDept('accesorios')}
            >
              <img
                src={bannerImg('YOL-165', 'accesorios')}
                alt="Accesorios"
                style={{ objectPosition: 'center 72%' }}
              />
              <div className="col-banner__overlay">
                <span className="col-banner__tag">Bolsos, Relojes &amp; Más</span>
                <strong>Accesorios ({deptCounts.accesorios})</strong>
                <span className="col-banner__cta">
                  Ver colección <ArrowRight size={14} />
                </span>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Catalog Controls & Grid */}
      <main id="catalogo" className="container catalog-section">
        <div className="filters-bar">
          <div className="search-input-wrap">
            <Search size={17} />
            <input
              type="search"
              placeholder="Buscar modelo, marca (Jordan, NB, Nike, Shein) o código YOL-..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleLimit(PAGE_STEP);
              }}
            />
            {search && (
              <button
                type="button"
                className="search-clear"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearch('')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="filters-right">
            <button
              type="button"
              className={`fav-filter-btn${onlyFavorites ? ' is-active' : ''}`}
              onClick={() => {
                setOnlyFavorites((v) => !v);
                setVisibleLimit(PAGE_STEP);
              }}
            >
              <Heart size={14} fill={onlyFavorites ? 'currentColor' : 'none'} />
              <span>Favoritos ({favoriteSkus.length})</span>
            </button>

            <label className="chk-pill">
              <input
                type="checkbox"
                checked={onlyPriced}
                onChange={(e) => setOnlyPriced(e.target.checked)}
              />
              <span>Solo con precio</span>
            </label>

            <div className="sort-wrap">
              <SlidersHorizontal size={15} />
              <select
                aria-label="Ordenar catálogo"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
              >
                <option value="featured">Destacados</option>
                <option value="price_asc">Menor precio</option>
                <option value="price_desc">Mayor precio</option>
                <option value="newest">Más recientes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sub-filtro Mujer / Hombre dentro de Moda Shein */}
        {department === 'moda_shein' && (
          <div className="sizes-filter-row shein-gender-row" aria-label="Filtrar Moda Shein por género">
            <span className="sizes-filter-label">Moda:</span>
            <div className="chips-scroller chips-scroller--compact">
              <button
                type="button"
                className={`chip${sheinGender === 'all' ? ' is-active' : ''}`}
                onClick={() => handleSelectSheinGender('all')}
              >
                Todo ({deptCounts.moda_shein + deptCounts.hombre})
              </button>
              <button
                type="button"
                className={`chip${sheinGender === 'mujer' ? ' is-active' : ''}`}
                onClick={() => handleSelectSheinGender('mujer')}
              >
                Mujer ({deptCounts.moda_shein})
              </button>
              <button
                type="button"
                className={`chip${sheinGender === 'hombre' ? ' is-active' : ''}`}
                onClick={() => handleSelectSheinGender('hombre')}
              >
                Hombre ({deptCounts.hombre})
              </button>
            </div>
          </div>
        )}

        {/* Category Chips */}
        <div className="chips-scroller" aria-label="Categorías">
          <button
            type="button"
            className={`chip${categoryId === 'all' ? ' is-active' : ''}`}
            onClick={() => {
              setCategoryId('all');
              setVisibleLimit(PAGE_STEP);
            }}
          >
            Todas las categorías
          </button>
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`chip${categoryId === cat.id ? ' is-active' : ''}`}
              onClick={() => {
                setCategoryId(cat.id);
                setVisibleLimit(PAGE_STEP);
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Size Filter Chips */}
        {availableSizes.length > 0 && (
          <div className="sizes-filter-row" aria-label="Filtrar por talla disponible">
            <span className="sizes-filter-label">Talla:</span>
            <div className="chips-scroller chips-scroller--compact">
              <button
                type="button"
                className={`chip chip--sm${sizeFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => setSizeFilter('all')}
              >
                Todas
              </button>
              {availableSizes.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={`chip chip--sm${sizeFilter === sz ? ' is-active' : ''}`}
                  onClick={() => {
                    setSizeFilter(sizeFilter === sz ? 'all' : sz);
                    setVisibleLimit(PAGE_STEP);
                  }}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Budget Filter Chips */}
        <div className="sizes-filter-row" aria-label="Filtrar por presupuesto">
          <span className="sizes-filter-label">Presupuesto:</span>
          <div className="chips-scroller chips-scroller--compact">
            {(
              [
                ['all', 'Todos'],
                ['under15', 'Hasta $15 USD'],
                ['15to30', '$15 – $30 USD'],
                ['over30', '+$30 USD'],
              ] as Array<[PriceRangeFilter, string]>
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={`chip chip--sm${priceRange === val ? ' is-active' : ''}`}
                onClick={() => {
                  setPriceRange(val);
                  setVisibleLimit(PAGE_STEP);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Result Count */}
        <div className="results-meta">
          <span>
            Mostrando <strong>{visibleProducts.length}</strong> de{' '}
            <strong>{filteredProducts.length}</strong> artículos
          </span>
          {(department !== 'all' ||
            sheinGender !== 'all' ||
            categoryId !== 'all' ||
            sizeFilter !== 'all' ||
            priceRange !== 'all' ||
            search ||
            onlyPriced ||
            onlyFavorites) && (
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setDepartment('all');
                setSheinGender('all');
                setCategoryId('all');
                setSizeFilter('all');
                setPriceRange('all');
                setSearch('');
                setOnlyPriced(false);
                setOnlyFavorites(false);
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Carrusel Lo más TOP (en catálogo amplio sin filtros activos) */}
        {!loading &&
          products.length >= 6 &&
          topFeaturedProducts.length > 0 &&
          department === 'all' &&
          categoryId === 'all' &&
          sizeFilter === 'all' &&
          priceRange === 'all' &&
          !search &&
          !onlyFavorites && (
            <section className="top-carousel-section" aria-label="Lo más TOP">
              <div className="recent-strip__head">
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Flame size={15} className="top-flame-icon" /> Lo más TOP
                </strong>
                <span>Desliza para ver lo más pedido</span>
              </div>
              <div className="top-carousel-scroller">
                {topFeaturedProducts.map((tp) => {
                  const tpPrice = getDisplayPrice(
                    tp,
                    displayCurrency,
                    settings.usd_to_cup_rate
                  );
                  return (
                    <button
                      key={`top-${tp.sku}`}
                      type="button"
                      className="top-mini-card"
                      onClick={() => openProductModal(tp)}
                    >
                      <div className="top-mini-card__media">
                        <img src={tp.image_url} alt={tp.title} loading="lazy" />
                        <span className="p-badge p-badge--feat">TOP</span>
                      </div>
                      <div className="top-mini-card__body">
                        <small>{tp.brand}</small>
                        <span className="top-mini-card__title">{tp.title}</span>
                        <strong>{tpPrice.primary}</strong>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

        {/* Vistos recientemente */}
        {recentProducts.length > 0 &&
          department === 'all' &&
          categoryId === 'all' &&
          sizeFilter === 'all' &&
          priceRange === 'all' &&
          !search &&
          !onlyFavorites && (
            <section className="recent-strip" aria-label="Vistos recientemente">
              <div className="recent-strip__head">
                <strong>Vistos recientemente</strong>
                <span>Toca para volver a ver</span>
              </div>
              <div className="recent-strip__scroller">
                {recentProducts.map((rp) => (
                  <button
                    key={rp.sku}
                    type="button"
                    className="recent-card"
                    onClick={() => openProductModal(rp)}
                  >
                    <img src={rp.image_url} alt={rp.title} loading="lazy" />
                    <div>
                      <small>{rp.sku}</small>
                      <span>{rp.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

        {loading ? (
          <div className="products-grid" aria-label="Cargando catálogo">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="p-card p-card-skeleton" aria-hidden="true">
                <div className="p-card__media skeleton-shimmer" />
                <div className="p-card__body">
                  <div className="skeleton-line skeleton-line--sm skeleton-shimmer" />
                  <div className="skeleton-line skeleton-line--lg skeleton-shimmer" />
                  <div className="skeleton-line skeleton-line--md skeleton-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="catalog-state catalog-state--err">
            <p>{loadError}</p>
            <button type="button" className="btn btn--primary" onClick={refreshData}>
              Reintentar
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="catalog-state">
            <p>
              {onlyFavorites
                ? 'Aún no tienes artículos guardados en Favoritos.'
                : 'No encontramos artículos con esos filtros.'}
            </p>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                setDepartment('all');
                setSheinGender('all');
                setCategoryId('all');
                setSizeFilter('all');
                setPriceRange('all');
                setSearch('');
                setOnlyPriced(false);
                setOnlyFavorites(false);
              }}
            >
              Ver todo el catálogo
            </button>
          </div>
        ) : (
          <>
            <div className="products-grid">
              {visibleProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  displayCurrency={displayCurrency}
                  settings={settings}
                  isFavorite={favoriteSet.has(product.sku)}
                  onToggleFavorite={toggleFavoriteSku}
                  onSelect={openProductModal}
                  onQuickAdd={handleAddToCart}
                />
              ))}
            </div>

            {visibleProducts.length < filteredProducts.length && (
              <div className="load-more-wrap">
                <button
                  type="button"
                  className="btn btn--outline-dark"
                  onClick={() => setVisibleLimit((n) => n + PAGE_STEP)}
                >
                  Cargar más ({filteredProducts.length - visibleProducts.length} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <strong>{settings.store_name.toUpperCase()}</strong>
            <p>{settings.tagline}</p>
            <p className="footer-policy">{settings.no_returns_notice}</p>
          </div>
          <div className="footer-right">
            <a
              href={directWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--whatsapp"
            >
              <MessageCircle size={17} />
              <span>Escribir por WhatsApp</span>
            </a>
            <button
              type="button"
              className="btn-admin-link"
              onClick={() => navigateAdmin(true)}
            >
              <Lock size={14} />
              <span>Administrar tienda</span>
            </button>
          </div>
        </div>
      </footer>

      {addedToast && (
        <div className="shop-toast" role="status" onClick={() => setCartOpen(true)}>
          <img src={addedToast.imageUrl} alt="" className="shop-toast__thumb" />
          <div className="shop-toast__info">
            <small>Agregado al carrito</small>
            <span>{addedToast.text}</span>
          </div>
          <strong>Ver carrito</strong>
        </div>
      )}

      {showScrollTop && (
        <button
          type="button"
          className="scroll-top-btn"
          aria-label="Subir arriba"
          title="Volver arriba"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <ArrowUp size={18} />
        </button>
      )}

      {selectedProduct && (
        <ProductModal
          key={selectedProduct.id}
          product={selectedProduct}
          displayCurrency={displayCurrency}
          settings={settings}
          isFavorite={favoriteSet.has(selectedProduct.sku)}
          onToggleFavorite={toggleFavoriteSku}
          onClose={closeProductModal}
          onAddToCart={handleAddToCart}
        />
      )}

      <CartDrawer
        open={cartOpen}
        items={cart}
        settings={settings}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemoveItem}
        onClear={() => setCart([])}
      />

      <FloatingCartButton
        totalUnits={totalUnits}
        onOpenCart={() => setCartOpen(true)}
      />

      <BottomMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        settings={settings}
        department={department}
        sheinGender={sheinGender}
        deptCounts={deptCounts}
        displayCurrency={displayCurrency}
        themeMode={themeMode}
        onToggleTheme={() =>
          setThemeMode((m) => (m === 'dark' ? 'light' : 'dark'))
        }
        favoriteCount={favoriteSkus.length}
        onlyFavorites={onlyFavorites}
        onToggleFavorites={() => {
          setOnlyFavorites((v) => !v);
          setVisibleLimit(PAGE_STEP);
        }}
        onSelectDept={handleSelectDept}
        onSelectSheinGender={handleSelectSheinGender}
        onChangeCurrency={setDisplayCurrency}
        onOpenAdmin={() => navigateAdmin(true)}
        directWaUrl={directWaUrl}
        canPromptInstall={Boolean(installPrompt)}
        isInstalled={isInstalled}
        onInstallApp={handleInstallApp}
      />
    </div>
  );
}
export default App;
