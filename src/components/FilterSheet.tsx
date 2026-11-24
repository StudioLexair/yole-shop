import { Check, Heart, SlidersHorizontal, Tag, Trash2, X } from 'lucide-react';
import type { Category, Department } from '../types';
import type {
  CalzadoSubFilter,
  PriceRangeFilter,
  SheinSubFilter,
  SortMode,
} from '../lib/catalog';

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  totalResults: number;
  department: Department | 'all';
  calzadoSub: CalzadoSubFilter;
  sheinGender: SheinSubFilter;
  deptCounts: {
    all: number;
    calzado: number;
    calzadoTenis: number;
    calzadoShein: number;
    moda_shein: number;
    hombre: number;
    accesorios: number;
    movilidad: number;
    solares: number;
  };
  categories: Category[];
  categoryId: string;
  availableSizes: string[];
  sizeFilter: string;
  priceRange: PriceRangeFilter;
  sort: SortMode;
  onlyPriced: boolean;
  onlyFavorites: boolean;
  favoriteCount: number;
  onSelectDept: (dep: Department | 'all') => void;
  onSelectCalzadoSub: (sub: CalzadoSubFilter) => void;
  onSelectSheinGender: (g: SheinSubFilter) => void;
  onSelectCategory: (id: string) => void;
  onSelectSize: (sz: string) => void;
  onSelectPriceRange: (pr: PriceRangeFilter) => void;
  onChangeSort: (s: SortMode) => void;
  onTogglePriced: () => void;
  onToggleFavorites: () => void;
  onClearAll: () => void;
}

export function FilterSheet({
  open,
  onClose,
  totalResults,
  department,
  calzadoSub,
  sheinGender,
  deptCounts,
  categories,
  categoryId,
  availableSizes,
  sizeFilter,
  priceRange,
  sort,
  onlyPriced,
  onlyFavorites,
  favoriteCount,
  onSelectDept,
  onSelectCalzadoSub,
  onSelectSheinGender,
  onSelectCategory,
  onSelectSize,
  onSelectPriceRange,
  onChangeSort,
  onTogglePriced,
  onToggleFavorites,
  onClearAll,
}: FilterSheetProps) {
  if (!open) return null;

  const sortOptions: Array<[SortMode, string]> = [
    ['featured', 'Destacados'],
    ['price_asc', 'Menor precio'],
    ['price_desc', 'Mayor precio'],
    ['newest', 'Más recientes'],
  ];

  const priceOptions: Array<[PriceRangeFilter, string]> = [
    ['all', 'Todos'],
    ['under15', 'Hasta $15 USD'],
    ['15to30', '$15 – $30 USD'],
    ['over30', '+$30 USD'],
  ];

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Filtros y orden"
      onClick={onClose}
    >
      <div className="sheet-panel filter-sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle-wrap" aria-hidden="true">
          <span className="sheet-handle" />
        </div>

        <header className="sheet-head">
          <div className="filter-sheet-title">
            <SlidersHorizontal size={18} />
            <div>
              <strong>Filtros y Orden</strong>
              <small>{totalResults} artículos coinciden</small>
            </div>
          </div>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="Cerrar filtros"
          >
            <X size={20} />
          </button>
        </header>

        <div className="sheet-body filter-sheet-body">
          {/* Ordenar por */}
          <div className="filter-group">
            <span className="sheet-label">Ordenar por</span>
            <div className="filter-grid-2">
              {sortOptions.map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={`filter-choice-btn${sort === val ? ' is-active' : ''}`}
                  onClick={() => onChangeSort(val)}
                >
                  <span>{label}</span>
                  {sort === val && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>

          {/* Preferencias rápidas */}
          <div className="filter-group">
            <span className="sheet-label">Preferencias</span>
            <div className="filter-grid-2">
              <button
                type="button"
                className={`filter-choice-btn${onlyFavorites ? ' is-active is-fav' : ''}`}
                onClick={onToggleFavorites}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Heart size={14} fill={onlyFavorites ? 'currentColor' : 'none'} />
                  Favoritos ({favoriteCount})
                </span>
                {onlyFavorites && <Check size={14} />}
              </button>

              <button
                type="button"
                aria-pressed={onlyPriced}
                className={`filter-choice-btn${onlyPriced ? ' is-active' : ''}`}
                onClick={onTogglePriced}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Tag size={14} />
                  Solo con precio
                </span>
                {onlyPriced && <Check size={14} />}
              </button>
            </div>
          </div>

          {/* Departamento y género Moda Shein */}
          <div className="filter-group">
            <span className="sheet-label">Colección</span>
            <div className="filter-wrap-chips">
              <button
                type="button"
                className={`chip${department === 'all' ? ' is-active' : ''}`}
                onClick={() => onSelectDept('all')}
              >
                Todo ({deptCounts.all})
              </button>
              <button
                type="button"
                className={`chip${department === 'calzado' ? ' is-active' : ''}`}
                onClick={() => onSelectDept('calzado')}
              >
                Calzado &amp; Tenis ({deptCounts.calzado})
              </button>
              <button
                type="button"
                className={`chip${department === 'moda_shein' ? ' is-active' : ''}`}
                onClick={() => onSelectDept('moda_shein')}
              >
                Moda Shein ({deptCounts.moda_shein + deptCounts.hombre})
              </button>
              <button
                type="button"
                className={`chip${department === 'accesorios' ? ' is-active' : ''}`}
                onClick={() => onSelectDept('accesorios')}
              >
                Accesorios ({deptCounts.accesorios})
              </button>
              <button
                type="button"
                className={`chip${department === 'movilidad' ? ' is-active' : ''}`}
                onClick={() => onSelectDept('movilidad')}
              >
                Motos &amp; Todo Virginia ({deptCounts.movilidad})
              </button>
              <button
                type="button"
                className={`chip${department === 'solares' ? ' is-active' : ''}`}
                onClick={() => onSelectDept('solares')}
              >
                Equipos Solares ({deptCounts.solares})
              </button>
            </div>

            {department === 'calzado' && deptCounts.calzadoShein > 0 && (
              <div className="filter-subgender">
                <span>Línea:</span>
                <button
                  type="button"
                  className={`chip chip--sm${calzadoSub === 'tenis' ? ' is-active' : ''}`}
                  onClick={() => onSelectCalzadoSub('tenis')}
                >
                  Tenis 3A &amp; G5 ({deptCounts.calzadoTenis})
                </button>
                <button
                  type="button"
                  className={`chip chip--sm${calzadoSub === 'zuecos' ? ' is-active' : ''}`}
                  onClick={() => onSelectCalzadoSub('zuecos')}
                >
                  Zuecos &amp; Sandalias Shein ({deptCounts.calzadoShein})
                </button>
              </div>
            )}

            {department === 'moda_shein' && (
              <div className="filter-subgender">
                <span>Sección:</span>
                <button
                  type="button"
                  className={`chip chip--sm${sheinGender === 'all' ? ' is-active' : ''}`}
                  onClick={() => onSelectSheinGender('all')}
                >
                  Todo ({deptCounts.moda_shein + deptCounts.hombre})
                </button>
                <button
                  type="button"
                  className={`chip chip--sm${sheinGender === 'mujer' ? ' is-active' : ''}`}
                  onClick={() => onSelectSheinGender('mujer')}
                >
                  Mujer ({deptCounts.moda_shein})
                </button>
                <button
                  type="button"
                  className={`chip chip--sm${sheinGender === 'hombre' ? ' is-active' : ''}`}
                  onClick={() => onSelectSheinGender('hombre')}
                >
                  Hombre ({deptCounts.hombre})
                </button>
                {deptCounts.calzadoShein > 0 && (
                  <button
                    type="button"
                    className={`chip chip--sm${sheinGender === 'zuecos' ? ' is-active' : ''}`}
                    onClick={() => onSelectSheinGender('zuecos')}
                  >
                    Zuecos &amp; Sandalias ({deptCounts.calzadoShein})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Presupuesto */}
          <div className="filter-group">
            <span className="sheet-label">Presupuesto</span>
            <div className="filter-wrap-chips">
              {priceOptions.map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={`chip${priceRange === val ? ' is-active' : ''}`}
                  onClick={() => onSelectPriceRange(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Categorías */}
          {categories.length > 0 && (
            <div className="filter-group">
              <span className="sheet-label">Categoría</span>
              <div className="filter-wrap-chips">
                <button
                  type="button"
                  className={`chip${categoryId === 'all' ? ' is-active' : ''}`}
                  onClick={() => onSelectCategory('all')}
                >
                  Todas
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`chip${categoryId === cat.id ? ' is-active' : ''}`}
                    onClick={() =>
                      onSelectCategory(categoryId === cat.id ? 'all' : cat.id)
                    }
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tallas */}
          {availableSizes.length > 0 && (
            <div className="filter-group">
              <span className="sheet-label">Talla disponible</span>
              <div className="filter-wrap-chips">
                <button
                  type="button"
                  className={`chip chip--sm${sizeFilter === 'all' ? ' is-active' : ''}`}
                  onClick={() => onSelectSize('all')}
                >
                  Todas
                </button>
                {availableSizes.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    className={`chip chip--sm${sizeFilter === sz ? ' is-active' : ''}`}
                    onClick={() => onSelectSize(sizeFilter === sz ? 'all' : sz)}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="filter-sheet-footer">
          <button type="button" className="btn btn-outline" onClick={onClearAll}>
            <Trash2 size={14} />
            <span>Limpiar todo</span>
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            <span>Ver {totalResults} resultados</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
