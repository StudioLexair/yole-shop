import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  Download,
  Flame,
  Menu,
  MessageCircle,
  Package,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import type {
  CartItem,
  Category,
  Coupon,
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
  validateCouponCode,
  writeCachedStoreData,
  writeFavoriteSkus,
  writeThemeMode,
  type DepartmentFilter,
  type PriceRangeFilter,
  type SortMode,
  type ThemeMode,
} from './lib/catalog';
import { trackStoreEvent } from './lib/analytics';
import { buildWhatsAppUrl, getDisplayPrice, normalizeWhatsAppDigits } from './lib/pricing';
import { SUPABASE_URL, STORAGE_BUCKET } from './lib/supabase';
import { ProductCard } from './components/ProductCard';
import { ProductModal } from './components/ProductModal';
import { CartDrawer } from './components/CartDrawer';
import { SplashLoader } from './components/SplashLoader';
import { FloatingCartButton } from './components/FloatingCartButton';
import { BottomMenuSheet } from './components/BottomMenuSheet';
import { SmartImage } from './components/SmartImage';
import { FilterSheet } from './components/FilterSheet';
import { ContentGuard } from './components/ContentGuard';
import { UpdateModal } from './components/UpdateModal';
import { OrderTrackerModal } from './components/OrderTrackerModal';
import { FlashDropBanner } from './components/FlashDropBanner';
import { checkAppUpdate, type EvaluatedUpdateState } from './lib/versionManager';
import {
  buildSearchLexicon,
  buildSearchSuggestions,
  parseSmartQuery,
} from './lib/smartSearch';

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
    () => isAdminPath() || import.meta.env.MODE === 'test'
  );
  const [splashMounted, setSplashMounted] = useState(
    () => !isAdminPath() && import.meta.env.MODE !== 'test'
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
  const [updateState, setUpdateState] = useState<EvaluatedUpdateState | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [sort, setSort] = useState<SortMode>('featured');
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('CUP');
  const [visibleLimit, setVisibleLimit] = useState(PAGE_STEP);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trackerCode, setTrackerCode] = useState('');
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
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
    if (import.meta.env.MODE === 'test' || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    let urlChanged = false;
    if (url.searchParams.has('_upd')) {
      url.searchParams.delete('_upd');
      urlChanged = true;
    }
    const trackParam = url.searchParams.get('track');
    if (trackParam) {
      setTrackerCode(trackParam.trim().toUpperCase());
      setTrackerOpen(true);
    }
    const vipParam = url.searchParams.get('vip') || url.searchParams.get('cupon');
    if (vipParam) {
      void validateCouponCode(vipParam).then((res) => {
        if (res.valid && res.coupon) setActiveCoupon(res.coupon);
      });
    }
    if (urlChanged) {
      const next = url.searchParams.toString()
        ? `${url.pathname}?${url.searchParams.toString()}`
        : url.pathname;
      window.history.replaceState({}, '', next);
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    let alive = true;
    const runCheck = () => {
      void checkAppUpdate().then((res) => {
        if (!alive) return;
        setUpdateState(res);
      });
    };
    runCheck();
    const timer = window.setInterval(runCheck, 60_000);
    const onFocus = () => runCheck();
    const onVis = () => {
      if (document.visibilityState === 'visible') runCheck();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

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

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchFocused(false);
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
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
    if (import.meta.env.MODE === 'test' || isAdmin) {
      setMinSplashDone(true);
      setSplashMounted(false);
      return;
    }
    const t = setTimeout(() => setMinSplashDone(true), 4400);
    return () => clearTimeout(t);
  }, [isAdmin]);

  useEffect(() => {
    if (!loading && minSplashDone) {
      const t = setTimeout(() => setSplashMounted(false), 460);
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
    trackStoreEvent({
      event_type: 'product_view',
      sku: product.sku,
      product_title: product.title,
    });
    if (typeof window !== 'undefined' && !isAdminPath()) {
      window.history.replaceState({}, '', `/p/${encodeURIComponent(product.sku)}`);
    }
  }, []);

  const closeProductModal = useCallback(() => {
    setSelectedProduct(null);
    if (typeof window !== 'undefined' && !isAdminPath()) {
      const url = new URL(window.location.href);
      if (/^\/p\/[A-Za-z0-9_-]+\/?$/i.test(url.pathname)) {
        window.history.replaceState({}, '', url.search ? `/${url.search}` : '/');
      } else if (url.searchParams.has('sku')) {
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

  const searchLexicon = useMemo(
    () => buildSearchLexicon(products, categories),
    [products, categories]
  );

  const parsedSearch = useMemo(
    () => (search.trim() ? parseSmartQuery(search, searchLexicon) : null),
    [search, searchLexicon]
  );

  const searchSuggestions = useMemo(
    () =>
      buildSearchSuggestions(
        search,
        products,
        categories,
        settings.usd_to_cup_rate,
        searchLexicon
      ),
    [search, products, categories, settings.usd_to_cup_rate, searchLexicon]
  );

  const effectiveSearchDept: DepartmentFilter = search.trim() ? 'all' : activeDeptFilter;

  const filteredProducts = useMemo(() => {
    const base = filterProducts(
      products,
      {
        department: effectiveSearchDept,
        categoryId,
        size: sizeFilter,
        search,
        onlyPriced,
        priceRange,
        includeSoldOut: settings.show_sold_out_public,
        sort,
      },
      settings.usd_to_cup_rate,
      categories,
      searchLexicon
    );
    if (!onlyFavorites) return base;
    return base.filter((p) => favoriteSet.has(p.sku));
  }, [
    products,
    categories,
    searchLexicon,
    effectiveSearchDept,
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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (sheinGender !== 'all') count += 1;
    if (categoryId !== 'all') count += 1;
    if (sizeFilter !== 'all') count += 1;
    if (priceRange !== 'all') count += 1;
    if (onlyPriced) count += 1;
    if (onlyFavorites) count += 1;
    if (sort !== 'featured') count += 1;
    return count;
  }, [sheinGender, categoryId, sizeFilter, priceRange, onlyPriced, onlyFavorites, sort]);

  const clearAllFilters = useCallback(() => {
    setDepartment('all');
    setSheinGender('all');
    setCategoryId('all');
    setSizeFilter('all');
    setPriceRange('all');
    setSearch('');
    setOnlyPriced(false);
    setOnlyFavorites(false);
    setSort('featured');
    setVisibleLimit(PAGE_STEP);
  }, []);

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
    trackStoreEvent({
      event_type: 'cart_add',
      sku: product.sku,
      product_title: product.title,
    });
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

  // Registrar búsquedas sin resultados con debounce para analítica real en /admin
  useEffect(() => {
    const q = search.trim();
    if (!q || q.length < 3 || loading || filteredProducts.length > 0) return;
    const t = window.setTimeout(() => {
      trackStoreEvent({ event_type: 'search_empty', query: q });
    }, 1100);
    return () => window.clearTimeout(t);
  }, [search, loading, filteredProducts.length]);

  const deepLinkHandledRef = useRef(false);

  useEffect(() => {
    if (deepLinkHandledRef.current || typeof window === 'undefined' || products.length === 0) {
      return;
    }
    const pathMatch = /^\/p\/([A-Za-z0-9_-]+)\/?$/i.exec(window.location.pathname);
    const skuParam =
      pathMatch?.[1] || new URLSearchParams(window.location.search).get('sku');
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
      <>
        <ContentGuard />
        <Suspense fallback={<SplashLoader visible label="Cargando panel administrador..." />}>
          <AdminView
            settings={settings}
            categories={categories}
            products={products}
            pricePresets={pricePresets}
            themeMode={themeMode}
            onToggleTheme={() =>
              setThemeMode((m) => (m === 'dark' ? 'light' : 'dark'))
            }
            onRefresh={refreshData}
            onBackToStore={() => navigateAdmin(false)}
          />
        </Suspense>
        <UpdateModal
          open={Boolean(updateState?.updateAvailable && !updateDismissed)}
          updateState={updateState}
          onClosePreview={() => setUpdateDismissed(true)}
        />
      </>
    );
  }

  return (
    <div className="app-shell">
      <ContentGuard />
      {splashMounted && (
        <SplashLoader
          visible={loading || !minSplashDone}
          productCount={products.length}
          label={loading ? 'Conectando catálogo oficial...' : 'Colección verificada · Todo listo'}
        />
      )}
      {/* Main Header — una sola fila superior limpia */}
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
            <span className="brand-monogram brand-monogram--img">
              <img src="/brand-mark.webp" alt="Logo Yole Shop" width={36} height={36} />
            </span>
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
              title="Menú, moneda y tema"
            >
              <Menu size={19} />
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
              <button
                type="button"
                className="btn btn--outline-dark btn--sm"
                onClick={() => setTrackerOpen(true)}
              >
                <Package size={15} />
                <span>Seguir pedido</span>
              </button>
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
              <SmartImage
                src={bannerImg('YOL-029', 'calzado')}
                alt="Calzado y Tenis"
                loading="eager"
                variant="banner"
              />
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
              <SmartImage
                src={bannerImg('YOL-122', 'moda_shein')}
                alt="Moda Shein Mujer y Hombre"
                loading="eager"
                variant="banner"
              />
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
              <SmartImage
                src={bannerImg('YOL-165', 'accesorios')}
                alt="Accesorios"
                loading="eager"
                variant="banner"
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
        {activeCoupon && (
          <div className="vip-active-banner" role="status">
            <span>
              <Tag size={14} /> Cupón VIP activado: <strong>{activeCoupon.code}</strong>
              {activeCoupon.vip_label ? ` (${activeCoupon.vip_label})` : ''}
            </span>
            <button type="button" className="btn-link" onClick={() => setCartOpen(true)}>
              Usar en carrito
            </button>
          </div>
        )}

        <FlashDropBanner
          settings={settings}
          newestActive={sort === 'newest'}
          onActivateNewest={() => {
            setSort((prev) => (prev === 'newest' ? 'featured' : 'newest'));
            setDepartment('all');
            setCategoryId('all');
            setVisibleLimit(PAGE_STEP);
          }}
        />

        <div className="search-filter-row">
          <div
            ref={searchWrapRef}
            className={`search-box-shell${searchFocused ? ' is-focused' : ''}`}
          >
            <div className="search-input-wrap">
              <Search size={17} />
              <input
                type="search"
                aria-label="Buscar en todo el catálogo"
                placeholder="Buscar tenis, vestidos, marca, o ej. 'menos de $25'..."
                value={search}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearchFocused(true);
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

            {searchFocused && (
              <div
                className="search-popover"
                role="region"
                aria-label="Búsqueda inteligente"
              >
                <div className="search-popover__head">
                  <span className="search-popover__kicker">
                    <Sparkles size={13} />
                    {search.trim()
                      ? 'Sugerencias inteligentes en toda la tienda'
                      : 'Búsqueda inteligente · Prueba escribir marca, prenda o precio'}
                  </span>
                  <button
                    type="button"
                    className="search-popover__close"
                    aria-label="Cerrar sugerencias"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setSearchFocused(false)}
                  >
                    Cerrar
                  </button>
                </div>

                {searchSuggestions.didYouMean && (
                  <button
                    type="button"
                    className="did-you-mean-btn"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSearch(searchSuggestions.didYouMean!);
                      setSearchFocused(false);
                      setVisibleLimit(PAGE_STEP);
                    }}
                  >
                    <Sparkles size={14} />
                    <span>
                      ¿Quisiste decir <strong>{searchSuggestions.didYouMean}</strong>?
                    </span>
                  </button>
                )}

                {searchSuggestions.priceIntentLabel && (
                  <div className="search-intent-pill">
                    Filtro detectado: <strong>{searchSuggestions.priceIntentLabel}</strong>
                  </div>
                )}

                {searchSuggestions.quickChips.length > 0 && (
                  <div className="search-popover__chips">
                    {searchSuggestions.quickChips.map((chipLabel) => (
                      <button
                        key={chipLabel}
                        type="button"
                        className="chip chip--sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSearch(chipLabel);
                          setSearchFocused(false);
                          setVisibleLimit(PAGE_STEP);
                        }}
                      >
                        {chipLabel}
                      </button>
                    ))}
                  </div>
                )}

                {search.trim() && searchSuggestions.topProducts.length > 0 && (
                  <div className="search-popover__hits">
                    {searchSuggestions.topProducts.map((hit) => {
                      const hp = getDisplayPrice(
                        hit,
                        displayCurrency,
                        settings.usd_to_cup_rate
                      );
                      return (
                        <button
                          key={`hit-${hit.sku}`}
                          type="button"
                          className="search-hit-row"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSearchFocused(false);
                            openProductModal(hit);
                          }}
                        >
                          <div className="search-hit-thumb">
                            <SmartImage
                              src={hit.image_url}
                              alt={hit.title}
                              variant="compact"
                              loading="eager"
                            />
                          </div>
                          <div className="search-hit-info">
                            <strong>{hit.title}</strong>
                            <small>
                              {hit.brand} · {hit.sku}
                            </small>
                          </div>
                          <span className="search-hit-price">{hp.primary}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className={`filter-trigger-btn${activeFilterCount > 0 ? ' has-active' : ''}`}
            aria-label="Filtros"
            onClick={() => setFilterOpen(true)}
          >
            <SlidersHorizontal size={16} />
            <span>Filtros</span>
            {activeFilterCount > 0 && (
              <span className="filter-badge">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {/* Typo correction banner when popover is closed */}
        {!searchFocused && parsedSearch?.didYouMean && (
          <div className="did-you-mean-inline" role="status">
            <Sparkles size={14} />
            <span>
              ¿Quisiste decir{' '}
              <button
                type="button"
                className="btn-link"
                onClick={() => setSearch(parsedSearch.didYouMean!)}
              >
                <strong>{parsedSearch.didYouMean}</strong>
              </button>
              ? Mostrando resultados sugeridos.
            </span>
          </div>
        )}

        {/* Active removable filter pills (only shown when user has filters applied) */}
        {(activeFilterCount > 0 || parsedSearch?.priceIntentLabel) && (
          <div className="active-filter-pills" aria-label="Filtros activos">
            {parsedSearch?.priceIntentLabel && (
              <span className="active-pill active-pill--smart">
                <Sparkles size={12} /> {parsedSearch.priceIntentLabel}
              </span>
            )}
            {sheinGender !== 'all' && (
              <button
                type="button"
                className="active-pill"
                onClick={() => setSheinGender('all')}
              >
                Moda: {sheinGender === 'mujer' ? 'Mujer' : 'Hombre'} <X size={12} />
              </button>
            )}
            {categoryId !== 'all' && (
              <button
                type="button"
                className="active-pill"
                onClick={() => setCategoryId('all')}
              >
                {categories.find((c) => c.id === categoryId)?.name || 'Categoría'}{' '}
                <X size={12} />
              </button>
            )}
            {sizeFilter !== 'all' && (
              <button
                type="button"
                className="active-pill"
                onClick={() => setSizeFilter('all')}
              >
                Talla: {sizeFilter} <X size={12} />
              </button>
            )}
            {priceRange !== 'all' && (
              <button
                type="button"
                className="active-pill"
                onClick={() => setPriceRange('all')}
              >
                {priceRange === 'under15'
                  ? 'Hasta $15 USD'
                  : priceRange === '15to30'
                    ? '$15 – $30 USD'
                    : '+$30 USD'}{' '}
                <X size={12} />
              </button>
            )}
            {onlyFavorites && (
              <button
                type="button"
                className="active-pill"
                onClick={() => setOnlyFavorites(false)}
              >
                Favoritos <X size={12} />
              </button>
            )}
            {onlyPriced && (
              <button
                type="button"
                className="active-pill"
                onClick={() => setOnlyPriced(false)}
              >
                Con precio <X size={12} />
              </button>
            )}
            {sort !== 'featured' && (
              <button
                type="button"
                className="active-pill"
                onClick={() => setSort('featured')}
              >
                {sort === 'price_asc'
                  ? 'Menor precio'
                  : sort === 'price_desc'
                    ? 'Mayor precio'
                    : 'Más recientes'}{' '}
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Active Result Count */}
        <div className="results-meta">
          <span>
            Mostrando <strong>{visibleProducts.length}</strong> de{' '}
            <strong>{filteredProducts.length}</strong> artículos
            {search.trim() && department !== 'all' ? ' (búsqueda global)' : ''}
          </span>
          {(department !== 'all' ||
            activeFilterCount > 0 ||
            search) && (
            <button
              type="button"
              className="btn-link"
              onClick={clearAllFilters}
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
                        <SmartImage
                          src={tp.image_url}
                          alt={tp.title}
                          loading="lazy"
                          variant="card"
                        />
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
                    <SmartImage
                      src={rp.image_url}
                      alt={rp.title}
                      loading="lazy"
                      variant="compact"
                      wrapperClassName="recent-card__thumb"
                    />
                    <div className="recent-card__meta">
                      <small>{rp.sku}</small>
                      <span className="recent-card__title">{rp.title}</span>
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

        {/* Espacio nativo para anuncios integrados de Studio Lexair Ads */}
        <div className="lexair-ad-slot-wrap">
          <div data-lexair-ad-slot="inline" />
        </div>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <strong>{settings.store_name.toUpperCase()}</strong>
            <p>{settings.tagline}</p>
            <p className="footer-policy">{settings.no_returns_notice}</p>
            <div className="footer-studio-credit">
              <span>Tienda online hecha por</span>
              <a
                href="https://studiolexair.ddns.net/"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-studio-link"
              >
                Studio Lexair
              </a>
              <span className="footer-studio-dot" aria-hidden="true">·</span>
              <span className="footer-studio-place">Cuba</span>
            </div>
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
          onWhatsAppClick={(prod) =>
            trackStoreEvent({
              event_type: 'whatsapp_click',
              sku: prod.sku,
              product_title: prod.title,
            })
          }
        />
      )}

      <CartDrawer
        open={cartOpen}
        items={cart}
        settings={settings}
        activeCoupon={activeCoupon}
        onApplyCoupon={setActiveCoupon}
        onOpenTracker={(code) => {
          setTrackerCode(code);
          setTrackerOpen(true);
        }}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemoveItem}
        onClear={() => setCart([])}
      />

      <OrderTrackerModal
        open={trackerOpen}
        initialCode={trackerCode}
        settings={settings}
        onClose={() => setTrackerOpen(false)}
      />

      <FloatingCartButton
        totalUnits={totalUnits}
        onOpenCart={() => setCartOpen(true)}
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        totalResults={filteredProducts.length}
        department={department}
        sheinGender={sheinGender}
        deptCounts={deptCounts}
        categories={visibleCategories}
        categoryId={categoryId}
        availableSizes={availableSizes}
        sizeFilter={sizeFilter}
        priceRange={priceRange}
        sort={sort}
        onlyPriced={onlyPriced}
        onlyFavorites={onlyFavorites}
        favoriteCount={favoriteSkus.length}
        onSelectDept={handleSelectDept}
        onSelectSheinGender={handleSelectSheinGender}
        onSelectCategory={(id) => {
          setCategoryId(id);
          setVisibleLimit(PAGE_STEP);
        }}
        onSelectSize={(sz) => {
          setSizeFilter(sz);
          setVisibleLimit(PAGE_STEP);
        }}
        onSelectPriceRange={(pr) => {
          setPriceRange(pr);
          setVisibleLimit(PAGE_STEP);
        }}
        onChangeSort={(s) => setSort(s)}
        onTogglePriced={() => setOnlyPriced((v) => !v)}
        onToggleFavorites={() => {
          setOnlyFavorites((v) => !v);
          setVisibleLimit(PAGE_STEP);
        }}
        onClearAll={clearAllFilters}
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
        onOpenTracker={() => setTrackerOpen(true)}
        directWaUrl={directWaUrl}
        canPromptInstall={Boolean(installPrompt)}
        isInstalled={isInstalled}
        onInstallApp={handleInstallApp}
      />

      <UpdateModal
        open={Boolean(!splashMounted && updateState?.updateAvailable && !updateDismissed)}
        updateState={updateState}
        onClosePreview={() => setUpdateDismissed(true)}
      />
    </div>
  );
}
export default App;
