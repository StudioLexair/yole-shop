import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from './App';
import { SplashLoader } from './components/SplashLoader';
import { fetchStoreData, writeCachedStoreData } from './lib/catalog';
import { DEFAULT_SETTINGS, type Category, type Product } from './types';

const mockCategories: Category[] = [
  { id: 'tenis-new-balance', name: 'New Balance', department: 'calzado', sort_order: 10 },
  { id: 'zuecos-sandalias', name: 'Zuecos & Sandalias', department: 'calzado', sort_order: 18 },
  { id: 'vestidos-shein', name: 'Vestidos Shein', department: 'moda_shein', sort_order: 20 },
  { id: 'moda-hombre', name: 'Moda Hombre', department: 'hombre', sort_order: 30 },
  { id: 'bolsos-relojes', name: 'Accesorios', department: 'accesorios', sort_order: 40 },
  { id: 'motos-electricas', name: 'Motorinas Eléctricas', department: 'movilidad', sort_order: 150 },
];

const mockProducts: Product[] = [
  {
    id: 'p1',
    sku: 'YOL-003',
    title: 'New Balance 9060 Blanco & Rosa',
    brand: 'New Balance',
    department: 'calzado',
    category_id: 'tenis-new-balance',
    quality: '3A',
    currency: 'CUP',
    cost_price: 35000,
    price: 35000,
    sizes: ['36', '38'],
    sold_out_sizes: ['36'],
    fit_note: '',
    image_url: 'https://example.com/nb.webp',
    image_path: 'catalog/YOL-003.webp',
    status: 'active',
    featured: true,
    source_group: 'bombazo_calzado',
    sort_order: 10,
  },
  {
    id: 'p2',
    sku: 'YOL-122',
    title: 'Vestido Corto Satén Chocolate',
    brand: 'SHEIN',
    department: 'moda_shein',
    category_id: 'vestidos-shein',
    quality: 'SHEIN',
    currency: 'USD',
    cost_price: null,
    price: null,
    sizes: ['S', 'M'],
    fit_note: '',
    image_url: 'https://example.com/shein.webp',
    image_path: 'catalog/YOL-122.webp',
    status: 'active',
    featured: true,
    source_group: 'shein_moda',
    sort_order: 20,
  },
  {
    id: 'p3',
    sku: 'YOL-197',
    title: 'Sudadera Hoodie Café Osito Bordado',
    brand: 'SHEIN',
    department: 'hombre',
    category_id: 'moda-hombre',
    quality: 'Importado',
    currency: 'USD',
    cost_price: null,
    price: 38,
    sizes: ['M', 'L'],
    fit_note: '',
    image_url: 'https://example.com/hombre.webp',
    image_path: 'catalog/YOL-197.webp',
    status: 'active',
    featured: false,
    source_group: 'shein_moda',
    sort_order: 30,
  },
  {
    id: 'p4',
    sku: 'YOL-095',
    title: 'Cartera Dior Beige & Negra',
    brand: 'Dior',
    department: 'accesorios',
    category_id: 'bolsos-relojes',
    quality: 'Premium',
    currency: 'USD',
    cost_price: null,
    price: 18,
    sizes: ['Única'],
    fit_note: '',
    image_url: 'https://example.com/dior.webp',
    image_path: 'catalog/YOL-095.webp',
    status: 'active',
    featured: false,
    source_group: 'accesorios',
    sort_order: 40,
  },
  {
    id: 'p5',
    sku: 'VIR-001',
    title: 'Motorina TopMaq TANK 72V 45Ah',
    brand: 'TopMaq',
    department: 'movilidad',
    category_id: 'motos-electricas',
    quality: 'Importado',
    currency: 'USD',
    cost_price: 2400,
    price: 2450,
    sizes: ['Rojo', 'Negro'],
    fit_note: 'Batería 72V 45Ah, 1 mes de garantía.',
    image_url: 'https://example.com/tank.webp',
    image_path: 'catalog/VIR-001.webp',
    status: 'active',
    featured: true,
    source_group: 'todo_virginia',
    sort_order: 2700,
  },
];

const sampleZuecoShein: Product = {
  id: 'p6',
  sku: 'YOL-183',
  title: 'Zuecos Café Claro Doble Hebilla',
  brand: 'SHEIN',
  department: 'calzado',
  category_id: 'zuecos-sandalias',
  quality: 'Importado',
  currency: 'USD',
  cost_price: 12,
  price: 14,
  sizes: ['37', '38'],
  fit_note: '',
  image_url: 'https://example.com/zueco.webp',
  image_path: 'catalog/YOL-183.webp',
  status: 'active',
  featured: false,
  source_group: 'shein_moda',
  sort_order: 15,
};

vi.mock('./lib/catalog', async () => {
  const actual = await vi.importActual<typeof import('./lib/catalog')>('./lib/catalog');
  return {
    ...actual,
    fetchStoreData: vi.fn(async () => ({
      settings: DEFAULT_SETTINGS,
      categories: mockCategories,
      products: mockProducts,
    })),
  };
});

describe('Yole Shop App', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    window.history.replaceState(null, '', '/');
  });

  it('carga productos, cambia moneda y completa flujo de talla y carrito', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('New Balance 9060 Blanco & Rosa')).toBeInTheDocument();
    });
    expect(screen.getByText('Vestido Corto Satén Chocolate')).toBeInTheDocument();
    expect(screen.queryByText(/Carteras & Relojes/i)).not.toBeInTheDocument();

    // Cambio de moneda vive dentro del panel de menú hamburguesa
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const menuPanel = screen.getByRole('dialog', { name: 'Menú principal' });
    fireEvent.click(within(menuPanel).getByRole('button', { name: 'USD' }));
    fireEvent.click(within(menuPanel).getByRole('button', { name: 'Cerrar menú' }));
    expect(screen.getByText('$35.71 USD')).toBeInTheDocument();

    fireEvent.click(screen.getByText('New Balance 9060 Blanco & Rosa'));
    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: '38' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Agregar al carrito' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Cerrar' }));

    // Botón flotante arrastrable abre el carrito directamente
    fireEvent.click(screen.getByRole('button', { name: /Carrito flotante/i }));
    expect(screen.getByText('Tu Pedido (1)')).toBeInTheDocument();
    expect(screen.getByText(/YOL-003 · Talla 38/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar pedido a WhatsApp' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar carrito' }));

    // Filtra Moda Shein -> muestra Mujer y Hombre juntos y permite elegir Hombre dentro del panel Filtros
    fireEvent.click(screen.getByRole('button', { name: /Moda Shein 2/i }));
    expect(screen.getByText('Vestido Corto Satén Chocolate')).toBeInTheDocument();
    expect(screen.getByText('Sudadera Hoodie Café Osito Bordado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const filterDialog = screen.getByRole('dialog', { name: 'Filtros y orden' });
    fireEvent.click(within(filterDialog).getByRole('button', { name: /Hombre \(1\)/i }));
    fireEvent.click(within(filterDialog).getByRole('button', { name: /Ver 1 resultados/i }));
    expect(screen.queryByText('Vestido Corto Satén Chocolate')).not.toBeInTheDocument();
    expect(screen.getByText('Sudadera Hoodie Café Osito Bordado')).toBeInTheDocument();

    // Menú hamburguesa abre desde abajo y permite navegar a Accesorios
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const sheet = screen.getByRole('dialog', { name: 'Menú principal' });
    expect(within(sheet).getByText('Explorar tienda')).toBeInTheDocument();
    expect(within(sheet).getByText(/Instalar App/i)).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: /Accesorios/i }));
    expect(screen.getByText('Cartera Dior Beige & Negra')).toBeInTheDocument();
  });

  it('renderiza catálogo cacheado al instante sin mostrar carteles de modo offline', async () => {
    writeCachedStoreData({
      settings: DEFAULT_SETTINGS,
      categories: mockCategories,
      products: mockProducts,
    });
    render(<App />);
    expect(screen.getByText('New Balance 9060 Blanco & Rosa')).toBeInTheDocument();
    expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/modo offline/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Cartera Dior Beige & Negra')).toBeInTheDocument();
    });
  });

  it('soporta favoritos desde Filtros, tallas agotadas por separado y botones compartir/descargar en ficha', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('New Balance 9060 Blanco & Rosa')).toBeInTheDocument();
    });

    // Los filtros en línea ya no saturan la vista principal
    expect(screen.queryByLabelText('Filtrar por presupuesto')).not.toBeInTheDocument();

    // Guardar en favoritos y filtrar por favoritos dentro de Filtros
    fireEvent.click(
      screen.getByRole('button', {
        name: /Guardar Cartera Dior Beige & Negra en favoritos/i,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    let filterDialog = screen.getByRole('dialog', { name: 'Filtros y orden' });
    fireEvent.click(within(filterDialog).getByRole('button', { name: /Favoritos \(1\)/i }));
    fireEvent.click(within(filterDialog).getByRole('button', { name: /Ver 1 resultados/i }));
    expect(screen.getByText('Cartera Dior Beige & Negra')).toBeInTheDocument();
    expect(screen.queryByText('New Balance 9060 Blanco & Rosa')).not.toBeInTheDocument();

    // Quitar filtro favoritos y abrir modal con botones Compartir y Descargar foto
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    filterDialog = screen.getByRole('dialog', { name: 'Filtros y orden' });
    fireEvent.click(within(filterDialog).getByRole('button', { name: /Favoritos \(1\)/i }));
    fireEvent.click(within(filterDialog).getByRole('button', { name: /Cerrar filtros/i }));

    fireEvent.click(screen.getByText('New Balance 9060 Blanco & Rosa'));
    const modal = screen.getByRole('dialog');
    expect(within(modal).getByRole('button', { name: '36' })).toBeDisabled();
    expect(within(modal).getByRole('button', { name: /Compartir/i })).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: /Descargar foto/i })).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: 'Cerrar' }));

    // Al cerrar, aparece la franja Vistos recientemente
    expect(screen.getByLabelText('Vistos recientemente')).toBeInTheDocument();
  });

  it('filtra por presupuesto en Filtros, corrige typos en búsqueda inteligente y abre lightbox', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Cartera Dior Beige & Negra')).toBeInTheDocument();
    });

    // Presupuesto $15 - $30 USD dentro de Filtros
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const filterDialog = screen.getByRole('dialog', { name: 'Filtros y orden' });
    fireEvent.click(within(filterDialog).getByRole('button', { name: '$15 – $30 USD' }));
    fireEvent.click(within(filterDialog).getByRole('button', { name: /Ver 1 resultados/i }));
    expect(screen.getByText('Cartera Dior Beige & Negra')).toBeInTheDocument();
    expect(screen.queryByText('New Balance 9060 Blanco & Rosa')).not.toBeInTheDocument();
    expect(screen.queryByText('Sudadera Hoodie Café Osito Bordado')).not.toBeInTheDocument();

    // Limpiar filtros vuelve a mostrar todo
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByText('New Balance 9060 Blanco & Rosa')).toBeInTheDocument();

    // Búsqueda inteligente: al enfocar muestra popover y al escribir "neww balance" corrige y sugiere "¿Quisiste decir New Balance?"
    const searchInput = screen.getByRole('searchbox', { name: 'Buscar en todo el catálogo' });
    fireEvent.focus(searchInput);
    expect(screen.getByRole('region', { name: 'Búsqueda inteligente' })).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'neww balance' } });
    const dymBtn = screen.getByRole('button', { name: /¿Quisiste decir New Balance/i });
    expect(dymBtn).toBeInTheDocument();
    expect(screen.getAllByText('New Balance 9060 Blanco & Rosa').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Cartera Dior Beige & Negra')).not.toBeInTheDocument();

    // Aceptar sugerencia aplica "New Balance" y cierra el popover
    fireEvent.click(dymBtn);
    expect((searchInput as HTMLInputElement).value).toBe('New Balance');
    expect(screen.queryByRole('region', { name: 'Búsqueda inteligente' })).not.toBeInTheDocument();
    expect(screen.getByText('New Balance 9060 Blanco & Rosa')).toBeInTheDocument();

    // Modo oscuro desde BottomMenuSheet aplica data-theme="dark" en <html>
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const sheet = screen.getByRole('dialog', { name: 'Menú principal' });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Cambiar entre modo claro y oscuro' })
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(within(sheet).getByText('Modo Oscuro elegante')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cerrar menú' }));

    // Abrir modal y abrir visor lightbox pantalla completa
    fireEvent.click(screen.getByText('New Balance 9060 Blanco & Rosa'));
    const modal = screen.getByRole('dialog');
    fireEvent.click(
      within(modal).getByRole('button', { name: 'Ampliar foto en pantalla completa' })
    );
    const lightbox = screen.getByRole('dialog', { name: /Foto ampliada/i });
    expect(lightbox).toBeInTheDocument();
    fireEvent.click(within(lightbox).getByRole('button', { name: 'Cerrar vista ampliada' }));
    expect(screen.queryByRole('dialog', { name: /Foto ampliada/i })).not.toBeInTheDocument();
  });

  it('incluye atribución a Studio Lexair, slot de anuncios y protección anti-copia/click derecho', async () => {
    const { container } = render(<App />);
    await waitFor(() => {
      expect(screen.getByText('New Balance 9060 Blanco & Rosa')).toBeInTheDocument();
    });

    // Atribución visible en footer + enlace a Studio Lexair
    const creditLinks = screen.getAllByRole('link', { name: /Studio Lexair/i });
    expect(creditLinks.some((a) => a.getAttribute('href') === 'https://studiolexair.ddns.net/')).toBe(true);

    // Slot inline para anuncios de Studio Lexair Ads
    expect(container.querySelector('[data-lexair-ad-slot="inline"]')).toBeInTheDocument();

    // Protección anti-click derecho, anti-copia y atajos de inspección sin bloquear inputs
    const titleEl = screen.getByText('New Balance 9060 Blanco & Rosa');
    const ctxEv = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fireEvent(titleEl, ctxEv);
    expect(ctxEv.defaultPrevented).toBe(true);
    expect(
      screen.getByText(/Contenido y diseño protegidos · Yole Shop por Studio Lexair/i)
    ).toBeInTheDocument();

    const f12Ev = new KeyboardEvent('keydown', { key: 'F12', bubbles: true, cancelable: true });
    fireEvent(document, f12Ev);
    expect(f12Ev.defaultPrevented).toBe(true);

    // En el buscador sí se permite click derecho/copiar/pegar con normalidad
    const searchInput = screen.getByRole('searchbox', { name: 'Buscar en todo el catálogo' });
    const inputCtxEv = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fireEvent(searchInput, inputCtxEv);
    expect(inputCtxEv.defaultPrevented).toBe(false);

    // No existen botones ni accesos públicos a /admin en la tienda ni en el menú
    expect(screen.queryByRole('button', { name: /Administrar/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const sheet = screen.getByRole('dialog', { name: 'Menú principal' });
    expect(within(sheet).queryByRole('button', { name: /Administrar/i })).not.toBeInTheDocument();
  });

  it('muestra la pantalla de presentación Yole Shop con el emblema oficial del lobo y contador de artículos', () => {
    render(<SplashLoader visible productCount={266} />);
    expect(screen.getByRole('status', { name: 'Cargando Yole Shop' })).toBeInTheDocument();
    expect(screen.getByText('YOLE SHOP')).toBeInTheDocument();
    expect(screen.getByText(/\+266 Artículos/i)).toBeInTheDocument();
    expect(screen.getByText(/Santa Clara · Edición Oficial/i)).toBeInTheDocument();
  });

  it('muestra Drop Flash Recién Llegados, Seguimiento QR de pedidos y solicitud de talla agotada', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('New Balance 9060 Blanco & Rosa')).toBeInTheDocument();
    });

    // Drop Flash banner visible y botón "Ver recién llegados" funciona
    expect(screen.getByLabelText('Recién llegados y ofertas flash')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ver recién llegados/i }));
    expect(screen.getByRole('button', { name: /Viendo recién llegados/i })).toBeInTheDocument();

    // Abrir Seguimiento de pedido desde el Hero
    fireEvent.click(screen.getByRole('button', { name: /Seguir pedido/i }));
    const trackerDialog = screen.getByRole('dialog', { name: 'Seguimiento de pedido' });
    expect(within(trackerDialog).getByPlaceholderText(/YOL-ORD-1042/i)).toBeInTheDocument();
    fireEvent.click(within(trackerDialog).getByRole('button', { name: 'Cerrar seguimiento' }));

    // En ficha de producto aparece el formulario "¿No está tu talla o está agotado? Encárganosla"
    fireEvent.click(screen.getByText('New Balance 9060 Blanco & Rosa'));
    const prodDialog = screen.getByRole('dialog');
    fireEvent.click(
      within(prodDialog).getByRole('button', { name: /No está tu talla o está agotado/i })
    );
    expect(within(prodDialog).getByRole('button', { name: /Enviar solicitud de talla/i })).toBeInTheDocument();
  });

  it('abre automáticamente el modal del producto al entrar por enlace compartido /p/YOL-003', async () => {
    window.history.replaceState(null, '', '/p/YOL-003');
    render(<App />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('New Balance 9060 Blanco & Rosa')).toBeInTheDocument();
  });

  it('soporta Motos & Todo Virginia y bloquea transferencia para ropa Shein mujer/hombre', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('New Balance 9060 Blanco & Rosa')).toBeInTheDocument();
    });

    // Navegar al departamento Motos & Virginia y agregar VIR-001
    fireEvent.click(screen.getByRole('button', { name: /Motos & Virginia/i }));
    expect(screen.getByText('Motorina TopMaq TANK 72V 45Ah')).toBeInTheDocument();
    expect(screen.queryByText('New Balance 9060 Blanco & Rosa')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Motorina TopMaq TANK 72V 45Ah'));
    const motoModal = screen.getByRole('dialog');
    fireEvent.click(within(motoModal).getByRole('button', { name: /Agregar al carrito/i }));
    fireEvent.click(within(motoModal).getByRole('button', { name: 'Cerrar' }));

    // Sin Shein en el carrito, transferencia está habilitada
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrito' }));
    let cartDialog = screen.getByRole('dialog', { name: 'Carrito de compra' });
    const transfBtn = within(cartDialog).getByRole('button', { name: /Transf\./i });
    expect(transfBtn).not.toBeDisabled();
    fireEvent.click(transfBtn);
    expect(transfBtn.className).toContain('is-active');
    fireEvent.click(within(cartDialog).getByRole('button', { name: 'Cerrar carrito' }));

    // Agregar artículo Shein Hombre (YOL-197): se bloquea transferencia automáticamente
    const nav = screen.getByRole('navigation', { name: 'Departamentos' });
    fireEvent.click(within(nav).getByRole('button', { name: /Moda Shein/i }));
    expect(screen.getByText('Sudadera Hoodie Café Osito Bordado')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sudadera Hoodie Café Osito Bordado'));
    const sheinModal = screen.getByRole('dialog');
    expect(
      within(sheinModal).getByText(/artículos Shein no admiten transferencia/i)
    ).toBeInTheDocument();
    fireEvent.click(within(sheinModal).getByRole('button', { name: /Agregar al carrito/i }));
    fireEvent.click(within(sheinModal).getByRole('button', { name: 'Cerrar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrito' }));
    cartDialog = screen.getByRole('dialog', { name: 'Carrito de compra' });
    const blockedTransf = within(cartDialog).getByRole('button', { name: /Transf\./i });
    expect(blockedTransf).toBeDisabled();
    expect(blockedTransf.className).not.toContain('is-active');
    expect(
      within(cartDialog).getByText(/Los productos de Shein no admiten pago por transferencia/i)
    ).toBeInTheDocument();
  });

  it('separa Tenis 3A & G5 de Zuecos & Sandalias Shein en Calzado, los muestra también en Moda Shein y bloquea transferencia', async () => {
    vi.mocked(fetchStoreData).mockResolvedValueOnce({
      settings: DEFAULT_SETTINGS,
      categories: mockCategories,
      products: [...mockProducts, sampleZuecoShein],
      pricePresets: [],
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText('New Balance 9060 Blanco & Rosa').length).toBeGreaterThan(0);
    });

    // Entrar a Calzado & Tenis: por defecto muestra Tenis 3A & G5 y oculta los zuecos Shein
    const nav = screen.getByRole('navigation', { name: 'Departamentos' });
    fireEvent.click(within(nav).getByRole('button', { name: /Calzado & Tenis/i }));
    const calzadoBar = screen.getByRole('group', { name: 'Línea de calzado' });
    expect(within(calzadoBar).getByRole('button', { name: /Tenis 3A & G5/i }).className).toContain('is-active');
    expect(screen.getByText('New Balance 9060 Blanco & Rosa')).toBeInTheDocument();
    expect(screen.queryByText('Zuecos Café Claro Doble Hebilla')).not.toBeInTheDocument();

    // Al pulsar Zuecos & Sandalias Shein dentro de Calzado -> muestra solo los zuecos con badge SHEIN
    fireEvent.click(within(calzadoBar).getByRole('button', { name: /Zuecos & Sandalias/i }));
    expect(screen.getByText('Zuecos Café Claro Doble Hebilla')).toBeInTheDocument();
    expect(screen.queryByText('New Balance 9060 Blanco & Rosa')).not.toBeInTheDocument();

    // También aparece dentro de Moda Shein -> chip Zuecos & Sandalias
    fireEvent.click(within(nav).getByRole('button', { name: /Moda Shein/i }));
    const sheinBar = screen.getByRole('group', { name: 'Sección Moda Shein' });
    fireEvent.click(within(sheinBar).getByRole('button', { name: /Zuecos & Sandalias/i }));
    expect(screen.getByText('Zuecos Café Claro Doble Hebilla')).toBeInTheDocument();

    // Al añadir el zueco al carrito, se bloquea Transferencia
    fireEvent.click(screen.getByText('Zuecos Café Claro Doble Hebilla'));
    const modal = screen.getByRole('dialog');
    expect(
      within(modal).getByText(/artículos Shein no admiten transferencia/i)
    ).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: /Agregar al carrito/i }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Cerrar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrito' }));
    const cartDialog = screen.getByRole('dialog', { name: 'Carrito de compra' });
    expect(within(cartDialog).getByRole('button', { name: /Transf\./i })).toBeDisabled();
  });
});
