import type { DepartmentFilter } from '../lib/catalog';

interface QuickDeptFiltersProps {
  department: DepartmentFilter;
  activeCategoryId: string;
  activeSize: string;
  activeSearch: string;
  availableFootwearSizes: string[];
  onSelectCategory: (catId: string) => void;
  onSelectSize: (size: string) => void;
  onApplyQuickQuery: (query: string) => void;
  onOpenAssistant: (tab?: 'chat' | 'solar' | 'compare' | 'kit') => void;
}

export function QuickDeptFilters({
  department,
  activeCategoryId,
  activeSize,
  activeSearch,
  availableFootwearSizes,
  onSelectCategory,
  onSelectSize,
  onApplyQuickQuery,
  onOpenAssistant,
}: QuickDeptFiltersProps) {
  const normSearch = activeSearch.trim().toLowerCase();

  if (department === 'calzado' || department === 'calzado_shein') {
    const sizes =
      availableFootwearSizes.length > 0
        ? availableFootwearSizes.slice(0, 12)
        : ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];
    return (
      <div className="quick-dept-bar" aria-label="Filtros rápidos de talla">
        <span className="quick-dept-bar__label">Talla rápida:</span>
        <button
          type="button"
          className={`quick-chip ${activeSize === 'all' ? 'is-active' : ''}`}
          onClick={() => onSelectSize('all')}
        >
          Todas
        </button>
        {sizes.map((sz) => (
          <button
            key={sz}
            type="button"
            className={`quick-chip ${activeSize === sz ? 'is-active' : ''}`}
            onClick={() => onSelectSize(activeSize === sz ? 'all' : sz)}
          >
            {sz}
          </button>
        ))}
      </div>
    );
  }

  if (department === 'movilidad') {
    const items: Array<{ label: string; catId?: string; query?: string }> = [
      { label: 'Todas', catId: 'all' },
      { label: 'Motorinas Eléctricas', catId: 'motos-electricas' },
      { label: 'Motos Gasolina', catId: 'motos-gasolina' },
      { label: 'Triciclos', catId: 'triciclos-electricos' },
      { label: 'Motores & Baterías', catId: 'motores-baterias' },
      { label: 'Bicimotos & Bicis', catId: 'bicimotos-bicis' },
      { label: 'Con Chapa', query: 'con chapa' },
    ];
    return (
      <div className="quick-dept-bar" aria-label="Filtros rápidos de movilidad">
        {items.map((it) => {
          const isActive = it.catId
            ? activeCategoryId === it.catId && !normSearch
            : normSearch === (it.query || '');
          return (
            <button
              key={it.label}
              type="button"
              className={`quick-chip ${isActive ? 'is-active' : ''}`}
              onClick={() => {
                if (it.catId) {
                  onApplyQuickQuery('');
                  onSelectCategory(it.catId);
                } else if (it.query) {
                  onSelectCategory('all');
                  onApplyQuickQuery(normSearch === it.query ? '' : it.query);
                }
              }}
            >
              {it.label}
            </button>
          );
        })}
        <button
          type="button"
          className="quick-chip quick-chip--pro"
          onClick={() => onOpenAssistant('kit')}
        >
          ⚙️ Remotorizar / Kit
        </button>
        <button
          type="button"
          className="quick-chip quick-chip--pro"
          onClick={() => onOpenAssistant('compare')}
        >
          ⚖️ Comparar modelos
        </button>
      </div>
    );
  }

  if (department === 'solares') {
    const items: Array<{ label: string; catId?: string; query?: string }> = [
      { label: 'Todo Solar', catId: 'all' },
      { label: 'Estaciones', catId: 'estaciones-energia' },
      { label: 'Paneles', catId: 'paneles-solares' },
      { label: 'Inversores', catId: 'inversores' },
      { label: 'Baterías LiFePO4', catId: 'baterias-solares' },
      { label: '110/220V Bifásico', query: '110/220v' },
    ];
    return (
      <div className="quick-dept-bar" aria-label="Filtros rápidos de equipos solares">
        {items.map((it) => {
          const isActive = it.catId
            ? activeCategoryId === it.catId && !normSearch
            : normSearch === (it.query || '');
          return (
            <button
              key={it.label}
              type="button"
              className={`quick-chip ${isActive ? 'is-active' : ''}`}
              onClick={() => {
                if (it.catId) {
                  onApplyQuickQuery('');
                  onSelectCategory(it.catId);
                } else if (it.query) {
                  onSelectCategory('all');
                  onApplyQuickQuery(normSearch === it.query ? '' : it.query);
                }
              }}
            >
              {it.label}
            </button>
          );
        })}
        <button
          type="button"
          className="quick-chip quick-chip--pro"
          onClick={() => onOpenAssistant('solar')}
        >
          ⚡ ¿Qué planta necesito?
        </button>
      </div>
    );
  }

  if (department === 'moda_shein' || department === 'shein_all' || department === 'hombre') {
    const shortcuts = ['Vestidos', 'Tops & Corset', 'Conjuntos', 'Jeans', 'Hasta $25'];
    return (
      <div className="quick-dept-bar" aria-label="Filtros rápidos de moda">
        <span className="quick-dept-bar__label">Rápido:</span>
        {shortcuts.map((term) => (
          <button
            key={term}
            type="button"
            className={`quick-chip ${normSearch === term.toLowerCase() ? 'is-active' : ''}`}
            onClick={() =>
              onApplyQuickQuery(normSearch === term.toLowerCase() ? '' : term)
            }
          >
            {term}
          </button>
        ))}
      </div>
    );
  }

  // All departments quick strip
  const topShortcuts = [
    'EcoFlow',
    'Motores Lifan',
    'Con Chapa',
    'Motorinas 72V',
    'Jordan 4',
    'Hasta $25',
  ];
  return (
    <div className="quick-dept-bar" aria-label="Accesos rápidos del catálogo">
      <button
        type="button"
        className="quick-chip quick-chip--pro"
        onClick={() => onOpenAssistant('chat')}
      >
        ✨ Asistente Yole Pro
      </button>
      <button
        type="button"
        className="quick-chip quick-chip--pro"
        onClick={() => onOpenAssistant('solar')}
      >
        ⚡ Calc. Solar
      </button>
      {topShortcuts.map((term) => (
        <button
          key={term}
          type="button"
          className={`quick-chip ${normSearch === term.toLowerCase() ? 'is-active' : ''}`}
          onClick={() =>
            onApplyQuickQuery(normSearch === term.toLowerCase() ? '' : term)
          }
        >
          {term}
        </button>
      ))}
    </div>
  );
}
