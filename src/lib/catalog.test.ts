import { describe, expect, it, beforeEach } from 'vitest';
import {
  filterProducts,
  collectAvailableSizes,
  makePresetSlug,
  readCachedStoreData,
  writeCachedStoreData,
} from './catalog';
import { DEFAULT_SETTINGS, type Product } from '../types';

const items: Product[] = [
  {
    id: 'a',
    sku: 'YOL-001',
    title: 'Air Jordan 4 Black Cat',
    brand: 'Jordan',
    department: 'calzado',
    category_id: 'tenis-jordan',
    quality: '3A',
    currency: 'CUP',
    cost_price: 30000,
    price: 30000,
    sizes: ['40', '41'],
    fit_note: '',
    image_url: 'https://x.test/a.webp',
    image_path: 'a.webp',
    status: 'active',
    featured: true,
    source_group: 'bombazo',
    sort_order: 10,
  },
  {
    id: 'b',
    sku: 'YOL-120',
    title: 'Vestido Corto Marfil',
    brand: 'SHEIN',
    department: 'moda_shein',
    category_id: 'vestidos-shein',
    quality: 'SHEIN',
    currency: 'USD',
    cost_price: null,
    price: null,
    sizes: ['S', 'M'],
    fit_note: '',
    image_url: 'https://x.test/b.webp',
    image_path: 'b.webp',
    status: 'active',
    featured: false,
    source_group: 'shein',
    sort_order: 20,
  },
  {
    id: 'c',
    sku: 'YOL-177',
    title: 'Pack Leggings Agotado',
    brand: 'SHEIN',
    department: 'moda_shein',
    category_id: 'enterizos-leggings',
    quality: 'SHEIN',
    currency: 'USD',
    cost_price: null,
    price: null,
    sizes: ['S', 'M'],
    fit_note: '',
    image_url: 'https://x.test/c.webp',
    image_path: 'c.webp',
    status: 'sold_out',
    featured: false,
    source_group: 'shein',
    sort_order: 30,
  },
];

describe('catalog filters', () => {
  it('oculta agotados cuando includeSoldOut es false', () => {
    const res = filterProducts(
      items,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: '',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      920
    );
    expect(res.map((p) => p.sku)).toEqual(['YOL-001', 'YOL-120']);
  });

  it('filtra por talla exacta y búsqueda SKU', () => {
    const bySize = filterProducts(
      items,
      {
        department: 'all',
        categoryId: 'all',
        size: '41',
        search: '',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      920
    );
    expect(bySize.map((p) => p.sku)).toEqual(['YOL-001']);

    const bySku = filterProducts(
      items,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'YOL-120',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      920
    );
    expect(bySku.map((p) => p.sku)).toEqual(['YOL-120']);
  });

  it('ordena tallas numéricas y de ropa correctamente', () => {
    expect(collectAvailableSizes(items)).toEqual(['40', '41', 'S', 'M']);
  });

  it('genera slugs limpios para nuevos grupos de precio', () => {
    expect(makePresetSlug('Vestidos cortos (Mujer)')).toBe('vestidos-cortos-mujer');
    expect(makePresetSlug('Enguatadas de gorro · Niño')).toBe('enguatadas-de-gorro-nino');
  });

  it('agrupa moda_shein y hombre bajo shein_all', () => {
    const withMan: Product[] = [
      ...items,
      {
        ...items[1],
        id: 'd',
        sku: 'YOL-197',
        title: 'Sudadera Hoodie Café',
        department: 'hombre',
        category_id: 'moda-hombre',
        sizes: ['M', 'L'],
      },
    ];
    const res = filterProducts(
      withMan,
      {
        department: 'shein_all',
        categoryId: 'all',
        size: 'all',
        search: '',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980
    );
    expect(res.map((p) => p.sku)).toEqual(['YOL-120', 'YOL-197']);
  });
});

describe('offline-first catalog cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('guarda y recupera catálogo en localStorage silenciosamente', () => {
    expect(readCachedStoreData()).toBeNull();
    writeCachedStoreData({
      settings: DEFAULT_SETTINGS,
      categories: [{ id: 'bolsos-relojes', name: 'Accesorios', department: 'accesorios', sort_order: 50 }],
      products: items,
    });
    const restored = readCachedStoreData();
    expect(restored?.products).toHaveLength(3);
    expect(restored?.categories[0]?.name).toBe('Accesorios');
  });
});
