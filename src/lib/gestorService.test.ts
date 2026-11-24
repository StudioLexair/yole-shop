import { describe, expect, it } from 'vitest';
import type { Product, PublicGestorCatalog } from '../types';
import {
  applyGestorCatalogOverlay,
  buildGestorShareUrl,
  buildSyntheticGestorEmail,
  computeGestorProductPrice,
  normalizeGestorSlug,
} from './gestorService';

const makeProduct = (overrides: Partial<Product>): Product => ({
  id: 'p-1',
  sku: 'YOL-001',
  title: 'Nike Air Max 97',
  brand: 'Nike',
  department: 'calzado',
  category_id: 'tenis-hombre',
  price_preset_id: null,
  quality: 'G5',
  currency: 'CUP',
  cost_price: 20,
  price: 19600,
  sizes: ['41', '42'],
  sold_out_sizes: [],
  fit_note: '',
  image_url: '/demo.webp',
  image_path: 'catalog/YOL-001.webp',
  extra_images: [],
  video_url: '',
  status: 'active',
  featured: false,
  source_group: 'test',
  sort_order: 10,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('gestorService', () => {
  it('normalizes gestor slugs and creates no-Gmail synthetic auth emails from phone', () => {
    expect(normalizeGestorSlug('José Carlos Pérez!')).toBe('JOSECARLOSPEREZ');
    expect(buildSyntheticGestorEmail('+53 5267-8747')).toBe('g_5352678747@gestores.yoleshop.app');
    expect(buildGestorShareUrl('carlos_pro')).toContain('?g=CARLOS_PRO');
  });

  it('never allows custom price below Yole base price and applies dept markups cleanly', () => {
    const tenisCup = makeProduct({
      id: 'shoe-1',
      department: 'calzado',
      currency: 'CUP',
      price: 19600,
    });
    const motoUsd = makeProduct({
      id: 'moto-1',
      department: 'movilidad',
      currency: 'USD',
      price: 1200,
    });
    const solarUsd = makeProduct({
      id: 'sol-1',
      department: 'solares',
      currency: 'USD',
      price: 550,
    });
    const consultItem = makeProduct({
      id: 'cons-1',
      department: 'accesorios',
      currency: 'USD',
      price: null,
    });

    const gestor: PublicGestorCatalog = {
      id: 'g-1',
      slug: 'CARLOS',
      store_label: 'Catálogo Carlos',
      contact_whatsapp: '+5355551234',
      hide_yole_sku: true,
      default_markups: {
        calzado: 10, // +10 USD -> +9800 CUP at 980 rate
        movilidad: 100, // +100 USD
      },
      prices: {
        'moto-1': 1450, // manual override wins over +100 dept markup
        'sol-1': 400, // illegal lower price -> clamped up to Yole base 550
      },
    };

    expect(computeGestorProductPrice(tenisCup, gestor, 980)).toBe(29400);
    expect(computeGestorProductPrice(motoUsd, gestor, 980)).toBe(1450);
    expect(computeGestorProductPrice(solarUsd, gestor, 980)).toBe(550);
    expect(computeGestorProductPrice(consultItem, gestor, 980)).toBeNull();

    const overlaid = applyGestorCatalogOverlay(
      [tenisCup, motoUsd, solarUsd, consultItem],
      gestor,
      980
    );
    expect(overlaid.map((p) => p.price)).toEqual([29400, 1450, 550, null]);
    // Original products must stay untouched
    expect(motoUsd.price).toBe(1200);
  });
});
