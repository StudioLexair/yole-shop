import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import {
  classifyAnalysisOutcome,
  compareFingerprints,
  extractJsonObjectFromAiText,
  generateNextSku,
  normalizeSizeTokens,
  parsePriceFromAny,
  type VisualFingerprint,
} from './photoSync';

const SAMPLE_YOL_035: Product = {
  id: 'prod-035',
  sku: 'YOL-035',
  title: 'Air Jordan 4 Black Cat Negro',
  brand: 'Jordan',
  category_id: 'cat-1',
  department: 'calzado',
  quality: '3A',
  cost_price: null,
  price: 30000,
  currency: 'CUP',
  sizes: ['38', '39', '40', '41', '42', '43'],
  sold_out_sizes: [],
  extra_images: [],
  video_url: undefined,
  fit_note: '',
  image_url: 'https://example.com/YOL-035.webp',
  image_path: 'catalog/YOL-035.webp',
  status: 'active',
  featured: false,
  price_preset_id: null,
  source_group: 'yole-whatsapp',
  sort_order: 35,
  created_at: '',
  updated_at: '',
};

describe('photoSync engine', () => {
  it('parsea correctamente precios en mil, puntos, CUP y USD', () => {
    expect(parsePriceFromAny('30mil')).toEqual({ price: 30000, currency: 'CUP' });
    expect(parsePriceFromAny('35 mil CUP')).toEqual({ price: 35000, currency: 'CUP' });
    expect(parsePriceFromAny('$85')).toEqual({ price: 85, currency: 'USD' });
    expect(parsePriceFromAny('18 USD')).toEqual({ price: 18, currency: 'USD' });
    expect(parsePriceFromAny('28.000')).toEqual({ price: 28000, currency: 'CUP' });
  });

  it('normaliza y ordena tallas de calzado y ropa sin duplicados', () => {
    expect(normalizeSizeTokens(['41.42', '38', '40', '39', '42'])).toEqual([
      '38',
      '39',
      '40',
      '41',
      '42',
    ]);
    expect(normalizeSizeTokens(['xl', 's', 'm', 'l'])).toEqual(['S', 'M', 'L', 'XL']);
  });

  it('detecta tallas tachadas al comparar extracción nueva contra tallas anteriores (caso YOL-035)', () => {
    const res = classifyAnalysisOutcome({
      matchedProduct: SAMPLE_YOL_035,
      matchScore: 0.94,
      extracted: {
        same_product: true,
        price: 30000,
        currency: 'CUP',
        available_sizes: ['38', '39', '40', '41', '42'],
        crossed_out_sizes: ['43'],
      },
      defaultCategoryId: 'cat-1',
      suggestedSku: 'YOL-269',
      fileName: 'whatsapp-1.jpg',
    });

    expect(res.bucket).toBe('update');
    expect(res.availableSizes).toEqual(['38', '39', '40', '41', '42']);
    expect(res.soldOutSizes).toEqual(['43']);
    expect(res.selected).toBe(true);
  });

  it('clasifica como Sin cambios cuando foto, tallas y precio coinciden exactamente', () => {
    const res = classifyAnalysisOutcome({
      matchedProduct: SAMPLE_YOL_035,
      matchScore: 0.96,
      extracted: {
        same_product: true,
        price: 30000,
        currency: 'CUP',
        available_sizes: ['38', '39', '40', '41', '42', '43'],
        crossed_out_sizes: [],
      },
      defaultCategoryId: 'cat-1',
      suggestedSku: 'YOL-269',
      fileName: 'whatsapp-2.jpg',
    });

    expect(res.bucket).toBe('unchanged');
    expect(res.selected).toBe(false);
  });

  it('clasifica como Modelo nuevo cuando no hay coincidencia o la IA dice same_product=false', () => {
    const res = classifyAnalysisOutcome({
      matchedProduct: SAMPLE_YOL_035,
      matchScore: 0.72,
      extracted: {
        same_product: false,
        price: '$85',
        currency: 'USD',
        available_sizes: ['40', '41', '42'],
        title: 'Air Jordan 4 University Blue',
        brand: 'Jordan',
        quality: 'G5',
        department: 'calzado',
      },
      defaultCategoryId: 'cat-1',
      suggestedSku: 'YOL-269',
      fileName: 'whatsapp-3.jpg',
    });

    expect(res.bucket).toBe('new_product');
    expect(res.suggestedSku).toBe('YOL-269');
    expect(res.price).toBe(85);
    expect(res.currency).toBe('USD');
    expect(res.quality).toBe('G5');
  });

  it('extrae JSON de respuestas con markdown fences y genera SKU secuencial único', () => {
    const parsed = extractJsonObjectFromAiText(
      '```json\n{"same_product":true,"price":30000,"available_sizes":["38","39"]}\n```'
    );
    expect(parsed?.price).toBe(30000);
    expect(generateNextSku([SAMPLE_YOL_035], new Set(['YOL-260', 'YOL-261']))).toBe('YOL-262');
  });

  it('calcula similitud alta para huellas iguales y baja para distintas', () => {
    const fpA: VisualFingerprint = {
      sku: 'A',
      productId: '1',
      dhashHi: 0x12345678,
      dhashLo: 0xabcdef01,
      centerRgb: new Uint8Array(432).fill(40),
      fullRgb: new Uint8Array(768).fill(50),
    };
    const fpB: VisualFingerprint = {
      sku: 'B',
      productId: '2',
      dhashHi: 0xffffffff - 0x12345678,
      dhashLo: 0xffffffff - 0xabcdef01,
      centerRgb: new Uint8Array(432).fill(230),
      fullRgb: new Uint8Array(768).fill(220),
    };
    expect(compareFingerprints(fpA, fpA)).toBeCloseTo(1, 5);
    expect(compareFingerprints(fpA, fpB)).toBeLessThan(0.35);
  });
});
