import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Lock,
  MapPin,
  MessageCircle,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  CartItem,
  Category,
  Currency,
  Department,
  Product,
  StoreSettings,
} from './types';
import { DEFAULT_SETTINGS, DEPARTMENT_LABELS } from './types';
import {
  collectAvailableSizes,
  fetchStoreData,
  filterProducts,
  type SortMode,
} from './lib/catalog';
import { formatCup, normalizeWhatsAppDigits } from './lib/pricing';
import { ProductCard } from './components/ProductCard';
import { ProductModal } from './components/ProductModal';
import { CartDrawer } from './components/CartDrawer';

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
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [isAdmin, setIsAdmin] = useState<boolean>(isAdminPath);
  const [department, setDepartment] = useState<Department | 'all'>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [sizeFilter, setSizeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [onlyPriced, setOnlyPriced] = useState(false);
  const [sort, setSort] = useState<SortMode>('featured');
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('CUP');
  const [visibleLimit, setVisibleLimit] = useState(PAGE_STEP);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [addedToast, setAddedToast] = useState('');

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
    setLoadError('');
    try {
      const data = await fetchStoreData();
      setSettings(data.settings);
      setCategories(data.categories);
      setProducts(data.products);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'No se pudo conectar con el catálogo.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

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

  const visibleCategories = useMemo(() => {
    if (department === 'all') return categories;
    return categories.filter((c) => c.department === department);
  }, [categories, department]);

  const deptScopedProducts = useMemo(() => {
    return products.filter(
      (p) =>
        p.status !== 'hidden' &&
        (settings.show_sold_out_public || p.status !== 'sold_out') &&
        (department === 'all' || p.department === department) &&
        (categoryId === 'all' || p.category_id === categoryId)
    );
  }, [products, settings.show_sold_out_public, department, categoryId]);

  const availableSizes = useMemo(
    () => collectAvailableSizes(deptScopedProducts),
    [deptScopedProducts]
  );

  const filteredProducts = useMemo(
    () =>
      filterProducts(
        products,
        {
          department,
          categoryId,
          size: sizeFilter,
          search,
          onlyPriced,
          includeSoldOut: settings.show_sold_out_public,
          sort,
        },
        settings.usd_to_cup_rate
      ),
    [
      products,
      department,
      categoryId,
      sizeFilter,
      search,
      onlyPriced,
      settings.show_sold_out_public,
      sort,
      settings.usd_to_cup_rate,
    ]
  );

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleLimit),
    [filteredProducts, visibleLimit]
  );

  const handleSelectDept = (nextDept: Department | 'all') => {
    setDepartment(nextDept);
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
    setAddedToast(`Agregado: ${product.title} (${cleanSize})`);
    setTimeout(() => setAddedToast(''), 2200);
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
  const directWaUrl = `https://wa.me/${normalizeWhatsAppDigits(settings.whatsapp_number)}?text=${encodeURIComponent(
    `Hola ${settings.store_name}, quiero consultar sobre los productos del catálogo.`
  )}`;

  if (isAdmin) {
    return (
      <Suspense fallback={<div className="admin-login-page"><div className="admin-login-card">Cargando panel...</div></div>}>
        <AdminView
          settings={settings}
          categories={categories}
          products={products}
          onRefresh={refreshData}
          onBackToStore={() => navigateAdmin(false)}
        />
      </Suspense>
    );
  }

  return (
    <div className="app-shell">
      {/* Top Announcement */}
      <div className="promo-strip">
        <div className="container promo-strip__inner">
          <span>
            <MapPin size={13} /> {settings.location_text}
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
              <strong>{settings.store_name}</strong>
              <small>Calzado &amp; Moda Shein</small>
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
            {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((dep) => (
              <button
                key={dep}
                type="button"
                className={department === dep ? 'is-active' : ''}
                onClick={() => handleSelectDept(dep)}
              >
                {DEPARTMENT_LABELS[dep]} <span className="nav-count">{deptCounts[dep]}</span>
              </button>
            ))}
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
              <ShoppingBag size={18} />
              <span className="cart-btn__label">Carrito</span>
              {totalUnits > 0 && <span className="cart-badge">{totalUnits}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Showcase */}
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="hero-pill">
              <Sparkles size={14} />
              <span>{settings.hero_badge}</span>
            </div>
            <h1>{settings.hero_title}</h1>
            <p>{settings.hero_subtitle}</p>
            <div className="hero-ctas">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  handleSelectDept('calzado');
                  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <span>Ver Tenis ({deptCounts.calzado})</span>
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                className="btn btn--gold-outline"
                onClick={() => {
                  handleSelectDept('moda_shein');
                  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <span>Moda Shein ({deptCounts.moda_shein})</span>
              </button>
              <a
                href={directWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--whatsapp"
              >
                <MessageCircle size={17} />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>

          <div className="hero-stats-card">
            <div className="hero-stat">
              <strong>{deptCounts.all}</strong>
              <span>Productos disponibles</span>
            </div>
            <div className="hero-stat">
              <strong>3A · G5</strong>
              <span>Calzado verificado por talla</span>
            </div>
            <div className="hero-stat">
              <strong>SHEIN</strong>
              <span>Vestidos, tops, sets y hombre</span>
            </div>
            <div className="hero-stat">
              <strong>Directo</strong>
              <span>Atención inmediata por WhatsApp</span>
            </div>
          </div>
        </div>
      </section>

      {/* Catalog Controls & Grid */}
      <main id="catalogo" className="container catalog-section">
        <div className="filters-bar">
          <div className="search-input-wrap">
            <Search size={18} />
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
                <X size={15} />
              </button>
            )}
          </div>

          <div className="filters-right">
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

        {/* Active Result Count */}
        <div className="results-meta">
          <span>
            Mostrando <strong>{visibleProducts.length}</strong> de{' '}
            <strong>{filteredProducts.length}</strong> artículos
          </span>
          {(department !== 'all' || categoryId !== 'all' || sizeFilter !== 'all' || search || onlyPriced) && (
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setDepartment('all');
                setCategoryId('all');
                setSizeFilter('all');
                setSearch('');
                setOnlyPriced(false);
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {loading ? (
          <div className="catalog-state">Cargando catálogo de {settings.store_name}...</div>
        ) : loadError ? (
          <div className="catalog-state catalog-state--err">
            <p>{loadError}</p>
            <button type="button" className="btn btn--primary" onClick={refreshData}>
              Reintentar
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="catalog-state">
            <p>No encontramos artículos con esos filtros.</p>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                setDepartment('all');
                setCategoryId('all');
                setSizeFilter('all');
                setSearch('');
                setOnlyPriced(false);
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
                  onSelect={setSelectedProduct}
                  onQuickAdd={handleAddToCart}
                />
              ))}
            </div>

            {visibleProducts.length < filteredProducts.length && (
              <div className="load-more-wrap">
                <button
                  type="button"
                  className="btn btn--gold-outline"
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
            <strong>{settings.store_name}</strong>
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

      {/* Floating WhatsApp & Toast */}
      {addedToast && (
        <div className="shop-toast" role="status" onClick={() => setCartOpen(true)}>
          <ShoppingBag size={16} />
          <span>{addedToast}</span>
          <strong>Ver carrito</strong>
        </div>
      )}

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          displayCurrency={displayCurrency}
          settings={settings}
          onClose={() => setSelectedProduct(null)}
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
    </div>
  );
}
export default App;
