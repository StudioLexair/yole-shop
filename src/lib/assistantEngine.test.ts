import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Category, type Product } from '../types';
import {
  askYoleAssistant,
  buildComparisonMatrix,
  buildMobilityKitOptions,
  calculateSolarSizing,
  getCrossSellSuggestions,
} from './assistantEngine';
import {
  applyResellerMarkupUsd,
  buildSinglePagePdfFromJpeg,
  calculateShippingEstimate,
  formatChannelTotal,
} from './commerceTools';
import { extractProductSpecs } from './specExtractor';
import { buildSearchLexicon, setRuntimeCustomSynonyms } from './smartSearch';
import { filterProducts } from './catalog';

const categories: Category[] = [
  { id: 'motos-electricas', name: 'Motorinas Eléctricas', department: 'movilidad', sort_order: 10 },
  { id: 'motos-gasolina', name: 'Motos Gasolina', department: 'movilidad', sort_order: 20 },
  { id: 'motores-baterias', name: 'Motores & Baterías', department: 'movilidad', sort_order: 30 },
  { id: 'estaciones-energia', name: 'Estaciones de Energía', department: 'solares', sort_order: 40 },
  { id: 'paneles-solares', name: 'Paneles Solares', department: 'solares', sort_order: 50 },
];

const products: Product[] = [
  {
    id: '1',
    sku: 'VIR-001',
    title: 'Motorina TopMaq TANK 72V 45Ah',
    brand: 'TopMaq',
    department: 'movilidad',
    category_id: 'motos-electricas',
    quality: 'Importado',
    currency: 'USD',
    cost_price: 2350,
    price: 2450,
    sizes: ['Negro'],
    fit_note: '72V 45Ah autonomía 100 km, 6 meses garantía',
    image_url: 'https://x.test/tank.webp',
    image_path: 'tank.webp',
    status: 'active',
    featured: true,
    source_group: 'todo_virginia',
    sort_order: 10,
  },
  {
    id: '2',
    sku: 'VIR-005',
    title: 'Motorina BUCATTI 2026 (E4 / S90) 72V 45Ah',
    brand: 'Bucatti',
    department: 'movilidad',
    category_id: 'motos-electricas',
    quality: 'Importado',
    currency: 'USD',
    cost_price: 2100,
    price: 2200,
    sizes: ['Gris', 'Rojo'],
    fit_note: '72V 45Ah Litio con chapa cliente',
    image_url: 'https://x.test/bucatti.webp',
    image_path: 'bucatti.webp',
    status: 'active',
    featured: true,
    source_group: 'todo_virginia',
    sort_order: 20,
  },
  {
    id: '3',
    sku: 'VIR-075',
    title: 'Unidad / Motor LIFAN 250cc (Con Accesorios)',
    brand: 'Lifan',
    department: 'movilidad',
    category_id: 'motores-baterias',
    quality: 'Importado',
    currency: 'USD',
    cost_price: 935,
    price: 985,
    sizes: ['250cc'],
    fit_note: 'Para remotorizar cuadro con factura para Tránsito',
    image_url: 'https://x.test/lifan.webp',
    image_path: 'lifan.webp',
    status: 'active',
    featured: false,
    source_group: 'todo_virginia',
    sort_order: 30,
  },
  {
    id: '4',
    sku: 'VIR-056',
    title: 'Kit Completo de Triciclo (Diferencial y Eje)',
    brand: 'Todo Virginia',
    department: 'movilidad',
    category_id: 'motores-baterias',
    quality: 'Importado',
    currency: 'USD',
    cost_price: 1185,
    price: 1235,
    sizes: ['Kit Completo'],
    fit_note: 'Diferencial y eje para montaje',
    image_url: 'https://x.test/kit.webp',
    image_path: 'kit.webp',
    status: 'active',
    featured: false,
    source_group: 'todo_virginia',
    sort_order: 40,
  },
  {
    id: '5',
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
    fit_note: 'LiFePO4 110V ideal para apagones',
    image_url: 'https://x.test/delta2.webp',
    image_path: 'delta2.webp',
    status: 'active',
    featured: true,
    source_group: 'equipos_solares',
    sort_order: 50,
  },
  {
    id: '6',
    sku: 'SOL-020',
    title: 'EcoFlow Delta Pro Ultra (3600W · 3600Wh 110/220V Bifásico)',
    brand: 'EcoFlow',
    department: 'solares',
    category_id: 'estaciones-energia',
    quality: 'Importado',
    currency: 'USD',
    cost_price: 2500,
    price: 2550,
    sizes: ['Disponible'],
    fit_note: 'Salida 110/220V bifásico LiFePO4 para split y refrigerador',
    image_url: 'https://x.test/deltapro.webp',
    image_path: 'deltapro.webp',
    status: 'active',
    featured: true,
    source_group: 'equipos_solares',
    sort_order: 60,
  },
];

describe('Suite Yole Pro (Asistente, Ficha Técnica, Envíos, PDF y Sinónimos)', () => {
  it('extrae ficha técnica estructurada para motos y equipos solares', () => {
    const motoSpecs = extractProductSpecs(products[1]);
    expect(motoSpecs.metrics.voltage).toBe(72);
    expect(motoSpecs.metrics.ah).toBe(45);
    expect(motoSpecs.metrics.hasChapa).toBe(true);
    expect(motoSpecs.metrics.isLithium).toBe(true);
    expect(motoSpecs.pills.map((p) => p.label)).toContain('72V · 45Ah');
    expect(motoSpecs.pills.map((p) => p.label)).toContain('Con Chapa');

    const solarSpecs = extractProductSpecs(products[5]);
    expect(solarSpecs.metrics.watts).toBe(3600);
    expect(solarSpecs.metrics.wh).toBe(3600);
    expect(solarSpecs.pills.map((p) => p.label)).toContain('110/220V Bifásico');
  });

  it('calcula carga solar real y recomienda el equipo adecuado', () => {
    const light = calculateSolarSizing(
      [
        { id: 'refri', qty: 1 },
        { id: 'ventilador', qty: 2 },
        { id: 'wifi', qty: 1 },
      ],
      6,
      products,
      980
    );
    expect(light.continuousWatts).toBe(285);
    expect(light.peakSurgeWatts).toBe(785);
    expect(light.recommendations.length).toBe(2);

    const heavy = calculateSolarSizing(
      [
        { id: 'split', qty: 1 },
        { id: 'refri', qty: 1 },
      ],
      4,
      products,
      980
    );
    expect(heavy.continuousWatts).toBe(1200);
    expect(heavy.recommendations[0].product.sku).toBe('SOL-020');
  });

  it('construye comparativa con detección de mejores atributos', () => {
    const matrix = buildComparisonMatrix([products[0], products[1]], DEFAULT_SETTINGS);
    const priceRow = matrix.rows.find((r) => r.key === 'price_usd');
    expect(priceRow?.winnerIndices).toEqual([1]); // Bucatti $2200 < TopMaq $2450
    const docRow = matrix.rows.find((r) => r.label === 'Documentación');
    expect(docRow?.winnerIndices).toEqual([1]); // Bucatti has chapa
  });

  it('asistente unificado entiende comparación, cálculo solar y remotorización', () => {
    const lexicon = buildSearchLexicon(products, categories);

    const cmp = askYoleAssistant(
      'Compara TopMaq TANK vs Bucatti 2026',
      products,
      categories,
      DEFAULT_SETTINGS,
      lexicon
    );
    expect(cmp.mode).toBe('compare');
    if (cmp.mode === 'compare') {
      expect(cmp.matrix.products.map((p) => p.sku)).toEqual(['VIR-001', 'VIR-005']);
    }

    const sol = askYoleAssistant(
      '¿Qué planta necesito para refrigerador y 2 ventiladores 6 horas?',
      products,
      categories,
      DEFAULT_SETTINGS,
      lexicon
    );
    expect(sol.mode).toBe('solar');

    const kit = askYoleAssistant(
      'Quiero remotorizar un cuadro Suzuki',
      products,
      categories,
      DEFAULT_SETTINGS,
      lexicon
    );
    expect(kit.mode).toBe('kit');

    const mobKit = buildMobilityKitOptions('triciclo', products);
    expect(mobKit.accessoryItems.map((p) => p.sku)).toContain('VIR-056');
    expect(getCrossSellSuggestions(products[2], products).map((p) => p.sku)).toContain('VIR-056');
  });

  it('calcula flete pesado vs paquetería, multi-moneda, margen gestor, PDF 1.4 y sinónimos dinámicos', async () => {
    const lightShip = calculateShippingEstimate(
      'santa-clara',
      [{ product: { ...products[4], price: 150 }, size: 'Única', qty: 1 }],
      'domicilio'
    );
    expect(lightShip.isHeavy).toBe(false);
    expect(lightShip.feeUsd).toBe(2);

    const heavyShip = calculateShippingEstimate(
      'habana',
      [{ product: products[0], size: 'Negro', qty: 1 }],
      'domicilio'
    );
    expect(heavyShip.isHeavy).toBe(true);
    expect(heavyShip.feeUsd).toBe(80);

    expect(formatChannelTotal(100, 'zelle', DEFAULT_SETTINGS).formatted).toBe('$102 Zelle');
    expect(formatChannelTotal(100, 'cup', DEFAULT_SETTINGS).formatted).toContain('98');

    expect(
      applyResellerMarkupUsd(100, {
        enabled: true,
        mode: 'usd',
        value: 20,
        gestorName: 'CARLOS',
        hideYoleSku: true,
      })
    ).toBe(120);

    const pdfBlob = buildSinglePagePdfFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    expect(pdfBlob.type).toBe('application/pdf');
    expect(pdfBlob.size).toBeGreaterThan(250);
    const txt = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(fr.error);
      fr.readAsBinaryString(pdfBlob);
    });
    expect(txt.startsWith('%PDF-1.4')).toBe(true);
    expect(txt.endsWith('%%EOF')).toBe(true);

    // Runtime Admin custom synonym injection
    setRuntimeCustomSynonyms({ frizar: ['lifepo4', 'ecoflow'] });
    const lexicon = buildSearchLexicon(products, categories);
    const hits = filterProducts(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: 'frizar',
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      980,
      categories,
      lexicon
    );
    expect(hits.map((p) => p.sku)).toContain('SOL-015');
    setRuntimeCustomSynonyms({});
  });
});
