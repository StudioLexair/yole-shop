import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildSearchLexicon,
  buildSearchSuggestions,
  parseSmartQuery,
  pushSearchHistory,
  readSearchHistory,
  removeSearchHistoryItem,
  splitHighlightParts,
} from './smartSearch';
import { filterProducts, filterProductsWithMeta } from './catalog';
import type { Category, Product } from '../types';

const categories: Category[] = [
  { id: 'tenis-nb', name: 'Tenis New Balance', department: 'calzado', sort_order: 10 },
  { id: 'tenis-jordan', name: 'Air Jordan', department: 'calzado', sort_order: 15 },
  { id: 'vestidos-shein', name: 'Vestidos Shein', department: 'moda_shein', sort_order: 20 },
  { id: 'moda-hombre', name: 'Moda Hombre', department: 'hombre', sort_order: 30 },
  { id: 'bolsos-relojes', name: 'Carteras y Relojes', department: 'accesorios', sort_order: 40 },
  { id: 'motos-electricas', name: 'Motorinas Eléctricas', department: 'movilidad', sort_order: 50 },
  { id: 'estaciones-energia', name: 'Estaciones de Energía', department: 'solares', sort_order: 60 },
];

const products: Product[] = [
  {
    id: '1',
    sku: 'YOL-003',
    title: 'New Balance 9060 Blanco & Rosa',
    brand: 'New Balance',
    department: 'calzado',
    category_id: 'tenis-nb',
    quality: 'G5',
    currency: 'USD',
    cost_price: 25,
    price: 36,
    sizes: ['37', '38'],
    fit_note: '',
    image_url: 'https://x.test/nb.webp',
    image_path: 'nb.webp',
    status: 'active',
    featured: true,
    source_group: 'calzado',
    sort_order: 10,
  },
  {
    id: '2',
    sku: 'YOL-015',
    title: 'Air Jordan 4 Military Blue',
    brand: 'Jordan',
    department: 'calzado',
    category_id: 'tenis-jordan',
    quality: '3A',
    currency: 'CUP',
    cost_price: 28000,
    price: 28000,
    sizes: ['40', '42'],
    fit_note: '',
    image_url: 'https://x.test/j4.webp',
    image_path: 'j4.webp',
    status: 'active',
    featured: false,
    source_group: 'calzado',
    sort_order: 20,
  },
  {
    id: '3',
    sku: 'YOL-122',
    title: 'Vestido Corto Satinado',
    brand: 'SHEIN',
    department: 'moda_shein',
    category_id: 'vestidos-shein',
    quality: 'SHEIN',
    currency: 'USD',
    cost_price: 10,
    price: 14,
    sizes: ['S', 'M'],
    fit_note: '',
    image_url: 'https://x.test/vestido.webp',
    image_path: 'vestido.webp',
    status: 'active',
    featured: true,
    source_group: 'shein',
    sort_order: 30,
  },
  {
    id: '4',
    sku: 'YOL-197',
    title: 'Sudadera Hoodie Oversize',
    brand: 'SHEIN',
    department: 'hombre',
    category_id: 'moda-hombre',
    quality: 'Importado',
    currency: 'USD',
    cost_price: 20,
    price: 29,
    sizes: ['L', 'XL'],
    fit_note: '',
    image_url: 'https://x.test/hoodie.webp',
    image_path: 'hoodie.webp',
    status: 'active',
    featured: false,
    source_group: 'hombre',
    sort_order: 40,
  },
  {
    id: '5',
    sku: 'YOL-095',
    title: 'Cartera Dior Clásica',
    brand: 'Dior',
    department: 'accesorios',
    category_id: 'bolsos-relojes',
    quality: 'Premium',
    currency: 'USD',
    cost_price: 12,
    price: 18,
    sizes: ['Única'],
    fit_note: '',
    image_url: 'https://x.test/dior.webp',
    image_path: 'dior.webp',
    status: 'active',
    featured: false,
    source_group: 'accesorios',
    sort_order: 50,
  },
  {
    id: '6',
    sku: 'VIR-001',
    title: 'Motorina TopMaq TANK 72V 45Ah',
    brand: 'TopMaq',
    department: 'movilidad',
    category_id: 'motos-electricas',
    quality: 'Importado',
    currency: 'USD',
    cost_price: 2400,
    price: 2450,
    sizes: ['Negro'],
    fit_note: 'Batería de litio 72V 45Ah',
    image_url: 'https://x.test/tank.webp',
    image_path: 'tank.webp',
    status: 'active',
    featured: true,
    source_group: 'todo_virginia',
    sort_order: 60,
  },
  {
    id: '7',
    sku: 'VIR-023',
    title: 'Bicimoto Litio 48V 20Ah',
    brand: 'Litio',
    department: 'movilidad',
    category_id: 'motos-electricas',
    quality: 'Importado',
    currency: 'USD',
    cost_price: 710,
    price: 750,
    sizes: ['Azul'],
    fit_note: 'Autonomía 60km',
    image_url: 'https://x.test/bici.webp',
    image_path: 'bici.webp',
    status: 'active',
    featured: false,
    source_group: 'todo_virginia',
    sort_order: 70,
  },
  {
    id: '8',
    sku: 'SOL-015',
    title: 'EcoFlow Delta 2 (1800W / Pico 2700W · 1024Wh)',
    brand: 'EcoFlow',
    department: 'solares',
    category_id: 'estaciones-energia',
    quality: 'Importado',
    currency: 'USD',
    cost_price: 780,
    price: 790,
    sizes: ['Disponible'],
    fit_note: 'Respaldo silencioso para apagones, 1024Wh LiFePO4',
    image_url: 'https://x.test/delta2.webp',
    image_path: 'delta2.webp',
    status: 'active',
    featured: true,
    source_group: 'equipos_solares',
    sort_order: 80,
  },
];

const lexicon = buildSearchLexicon(products, categories);

describe('smartSearch engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('corrige errores tipográficos y sugiere "¿Quisiste decir ...?"', () => {
    const parsedNb = parseSmartQuery('neww balance', lexicon);
    expect(parsedNb.didYouMean).toBe('New Balance');
    expect(parsedNb.correctedTokens).toEqual(['new', 'balance']);

    const parsedJordan = parseSmartQuery('yordan 4', lexicon);
    expect(parsedJordan.didYouMean).toBe('Jordan 4');

    const parsedVestido = parseSmartQuery('vestdo', lexicon);
    expect(parsedVestido.didYouMean).toBe('Vestido');

    const nbHits = filterProducts(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'neww balance',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(nbHits.map((p) => p.sku)).toEqual(['YOL-003']);
  });

  it('interpreta precios en lenguaje natural y rangos', () => {
    const under20 = filterProducts(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'menos de $20',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(under20.map((p) => p.sku)).toEqual(['YOL-122', 'YOL-095']);

    const range15to30 = filterProducts(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'entre 15 y 30 usd',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(range15to30.map((p) => p.sku).sort()).toEqual(['YOL-015', 'YOL-095', 'YOL-197']);
  });

  it('busca globalmente por categoría, sinónimos de ropa/calzado y talla', () => {
    const byTenis = filterProducts(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'zapatillas g5',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(byTenis.map((p) => p.sku)).toEqual(['YOL-003']);

    const byCatName = filterProducts(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'relojes',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(byCatName.map((p) => p.sku)).toEqual(['YOL-095']);

    const byHombreAbrigo = filterProducts(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'abrigo hombre',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(byHombreAbrigo.map((p) => p.sku)).toEqual(['YOL-197']);
  });

  it('genera sugerencias instantáneas y vista previa de productos', () => {
    const emptySuggestions = buildSearchSuggestions('', products, categories, 980, lexicon);
    expect(emptySuggestions.quickChips.length).toBeGreaterThan(3);

    const typoSuggestions = buildSearchSuggestions(
      'neww balance',
      products,
      categories,
      980,
      lexicon
    );
    expect(typoSuggestions.didYouMean).toBe('New Balance');
    expect(typoSuggestions.topProducts.map((p) => p.sku)).toEqual(['YOL-003']);
  });

  it('entiende abreviaturas cubanas, especificaciones técnicas, typos solares y "barata" con orden económico', () => {
    // Abreviatura j4 + especificación con espacio "72 v" / "1024 wh" / jerga "planta apagon"
    const j4Hits = filterProducts(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'j4',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(j4Hits.map((p) => p.sku)).toEqual(['YOL-015']);

    const specHits = filterProducts(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'motorina 72 v negras',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(specHits.map((p) => p.sku)).toEqual(['VIR-001']);

    const apagonHits = filterProducts(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'planta apagon 1024 wh',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(apagonHits.map((p) => p.sku)).toEqual(['SOL-015']);

    // "motorina barata" ordena de menor a mayor precio en lugar de filtrar <= $15
    const cheapMotos = filterProducts(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'motorina barata',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(cheapMotos.map((p) => p.sku)).toEqual(['VIR-023', 'VIR-001']);

    // Fallback inteligente cuando una búsqueda multi-palabra exacta no coincide en un término extra
    const relaxed = filterProductsWithMeta(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'ecoflow delta 3 pro',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(relaxed.usedRelaxedMatch).toBe(true);
    expect(relaxed.products.map((p) => p.sku)).toEqual(['SOL-015']);

    // Resaltado e historial
    const parts = splitHighlightParts('EcoFlow Delta 2', ['ecoflow']);
    expect(parts.some((p) => p.hit && p.text === 'EcoFlow')).toBe(true);

    pushSearchHistory('EcoFlow');
    pushSearchHistory('Jordan 4');
    expect(readSearchHistory()).toEqual(['Jordan 4', 'EcoFlow']);
    removeSearchHistoryItem('EcoFlow');
    expect(readSearchHistory()).toEqual(['Jordan 4']);
  });
});
