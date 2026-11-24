import type { Category, Product, StoreSettings } from '../types';
import { filterProductsWithMeta } from './catalog';
import { normalizeText, parseSmartQuery, type SearchLexicon } from './smartSearch';
import { priceInCup, priceInUsd } from './pricing';
import { extractProductSpecs } from './specExtractor';

export interface SolarApplianceDef {
  id: string;
  name: string;
  watts: number;
  surgeWatts: number;
  defaultHours: number;
  keywords: string[];
}

export const SOLAR_APPLIANCES: SolarApplianceDef[] = [
  {
    id: 'refri',
    name: 'Refrigerador Inverter / Casa',
    watts: 150,
    surgeWatts: 650,
    defaultHours: 8,
    keywords: ['refri', 'refrigerador', 'frio', 'nevera', 'freezer'],
  },
  {
    id: 'split',
    name: 'Split Inverter 12,000 BTU',
    watts: 1050,
    surgeWatts: 1550,
    defaultHours: 6,
    keywords: ['split', 'aire', 'clima', 'acondicionado', '12000'],
  },
  {
    id: 'ventilador',
    name: 'Ventilador de Pedestal',
    watts: 60,
    surgeWatts: 90,
    defaultHours: 8,
    keywords: ['ventilador', 'ventiladores', 'abanico'],
  },
  {
    id: 'tv',
    name: 'TV LED + Cajita',
    watts: 95,
    surgeWatts: 120,
    defaultHours: 5,
    keywords: ['tv', 'televisor', 'tele', 'cajita'],
  },
  {
    id: 'wifi',
    name: 'Router WiFi / Módem',
    watts: 15,
    surgeWatts: 20,
    defaultHours: 10,
    keywords: ['wifi', 'router', 'internet', 'modem'],
  },
  {
    id: 'luces',
    name: '4 Bombillos LED',
    watts: 40,
    surgeWatts: 40,
    defaultHours: 6,
    keywords: ['luz', 'luces', 'bombillo', 'bombillos', 'foco', 'focos', 'led'],
  },
  {
    id: 'bomba',
    name: 'Turbina / Bomba ½ HP',
    watts: 450,
    surgeWatts: 1150,
    defaultHours: 1,
    keywords: ['turbina', 'bomba', 'agua', 'cisterna'],
  },
  {
    id: 'laptop',
    name: 'Laptop / Computadora',
    watts: 85,
    surgeWatts: 120,
    defaultHours: 5,
    keywords: ['laptop', 'computadora', 'pc', 'trabajo'],
  },
  {
    id: 'lavadora',
    name: 'Lavadora Semiautomática',
    watts: 380,
    surgeWatts: 700,
    defaultHours: 1.5,
    keywords: ['lavadora', 'lavar'],
  },
  {
    id: 'cocina',
    name: 'Olla Arrocera / Microondas',
    watts: 900,
    surgeWatts: 1200,
    defaultHours: 1,
    keywords: ['olla', 'arrocera', 'microondas', 'freidora', 'cafetera'],
  },
];

export interface SolarSelectionItem {
  id: string;
  qty: number;
  hours?: number;
}

export interface SolarRecommendation {
  product: Product;
  fitLabel: string;
  fitTone: 'green' | 'amber' | 'neutral';
  productWatts?: number;
  productWh?: number;
  estimatedHours: number | null;
}

export interface SolarSizingResult {
  continuousWatts: number;
  peakSurgeWatts: number;
  requiredWh: number;
  blackoutHours: number;
  selectedNames: string[];
  recommendations: SolarRecommendation[];
  suggestedPanels: Product[];
}

export function calculateSolarSizing(
  selections: SolarSelectionItem[],
  blackoutHours: number,
  products: Product[],
  usdToCupRate: number
): SolarSizingResult {
  const safeHours = Math.max(1, Math.min(24, blackoutHours || 6));
  let continuousWatts = 0;
  let peakSurgeExtra = 0;
  let totalWhRaw = 0;
  const selectedNames: string[] = [];

  for (const sel of selections) {
    if (sel.qty <= 0) continue;
    const def = SOLAR_APPLIANCES.find((a) => a.id === sel.id);
    if (!def) continue;
    const itemHours = Math.min(safeHours, sel.hours ?? def.defaultHours);
    continuousWatts += def.watts * sel.qty;
    peakSurgeExtra = Math.max(peakSurgeExtra, (def.surgeWatts - def.watts) * Math.min(sel.qty, 2));
    totalWhRaw += def.watts * sel.qty * itemHours;
    selectedNames.push(sel.qty > 1 ? `${sel.qty}× ${def.name}` : def.name);
  }

  const peakSurgeWatts = continuousWatts + peakSurgeExtra;
  const requiredWh = Math.round(totalWhRaw * 1.18); // inverter + cable losses

  const solarCandidates = products.filter(
    (p) =>
      p.status === 'active' &&
      p.department === 'solares' &&
      p.category_id !== 'paneles-solares' &&
      p.category_id !== 'accesorios-solares'
  );

  const hasSplitSelected = selections.some((s) => s.id === 'split' && s.qty > 0);

  const scored = solarCandidates.map((product) => {
    const specs = extractProductSpecs(product);
    const watts = specs.metrics.watts || 0;
    const surge = specs.metrics.surgeWatts || Math.round(watts * 1.5);
    const wh = specs.metrics.wh || 0;
    const isBifasico = /110\s*\/\s*220|bif[aá]sic/i.test(`${product.title} ${product.fit_note || ''}`);

    let score = 0;
    let fitLabel = 'Alternativa compatible';
    let fitTone: 'green' | 'amber' | 'neutral' = 'neutral';

    const coversContinuous = watts >= continuousWatts * 0.95;
    const coversSurge = surge >= peakSurgeWatts * 0.9;
    const coversWh = wh >= requiredWh * 0.85;
    const whCoverageScore = requiredWh > 0 && wh > 0 ? Math.min(35, (wh / requiredWh) * 35) : 0;

    if (continuousWatts === 0) {
      score = (product.featured ? 20 : 0) + (wh > 0 ? 10 : 0);
    } else if (coversContinuous && coversSurge && coversWh) {
      score = 130 + (isBifasico && hasSplitSelected ? 25 : 0) - Math.abs(wh - requiredWh) / 250;
      fitLabel = 'Cubre todo tu consumo';
      fitTone = 'green';
    } else if (coversContinuous && (wh > 0 || product.category_id === 'inversores')) {
      score =
        (product.category_id === 'inversores' && wh === 0 ? 70 : 75) +
        (coversSurge ? 12 : 0) +
        whCoverageScore +
        (isBifasico && hasSplitSelected ? 25 : 0);
      fitLabel =
        product.category_id === 'inversores'
          ? 'Inversor ideal (añadir batería)'
          : 'Cubre potencia · Apoyar con panel';
      fitTone = 'amber';
    } else if (wh > 0 && watts > 0) {
      score = 30 + Math.min(25, (watts / Math.max(1, continuousWatts)) * 20) + whCoverageScore * 0.4;
      fitLabel = 'Respaldo esencial / ligero';
      fitTone = 'neutral';
    } else {
      score = 15;
    }

    if (product.featured) score += 6;
    const estimatedHours =
      wh > 0 && continuousWatts > 0
        ? Math.max(0.5, Math.round(((wh * 0.85) / continuousWatts) * 10) / 10)
        : null;

    const usd = priceInUsd(product.price, product.currency, usdToCupRate) ?? 99999;

    return {
      product,
      fitLabel,
      fitTone,
      productWatts: watts || undefined,
      productWh: wh || undefined,
      estimatedHours,
      score,
      usd,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.usd - b.usd);

  const suggestedPanels = products
    .filter((p) => p.status === 'active' && p.category_id === 'paneles-solares')
    .slice(0, 3);

  return {
    continuousWatts,
    peakSurgeWatts,
    requiredWh,
    blackoutHours: safeHours,
    selectedNames,
    recommendations: scored.slice(0, 3).map(({ score: _s, usd: _u, ...rest }) => rest),
    suggestedPanels,
  };
}

export interface ComparisonRow {
  key: string;
  label: string;
  values: string[];
  winnerIndices: number[];
}

export interface ComparisonMatrix {
  products: Product[];
  rows: ComparisonRow[];
}

export function buildComparisonMatrix(
  compareProducts: Product[],
  settings: StoreSettings
): ComparisonMatrix {
  const clean = compareProducts.slice(0, 3);
  if (clean.length === 0) return { products: [], rows: [] };

  const specsList = clean.map((p) => extractProductSpecs(p));
  const usdList = clean.map((p) => priceInUsd(p.price, p.currency, settings.usd_to_cup_rate));
  const cupList = clean.map((p) => priceInCup(p.price, p.currency, settings.usd_to_cup_rate));

  const rows: ComparisonRow[] = [];

  // Price USD
  const validUsds = usdList.filter((u): u is number => u !== null);
  const minUsd = validUsds.length > 0 ? Math.min(...validUsds) : null;
  const priceWinners =
    minUsd !== null && clean.length > 1
      ? usdList.map((u, i) => (u === minUsd ? i : -1)).filter((i) => i >= 0)
      : [];
  rows.push({
    key: 'price_usd',
    label: 'Precio USD',
    values: usdList.map((u) => (u !== null ? `$${u} USD` : 'Consultar')),
    winnerIndices: priceWinners.length < clean.length ? priceWinners : [],
  });

  // Price CUP
  rows.push({
    key: 'price_cup',
    label: 'Equivalente CUP',
    values: cupList.map((c) => (c !== null ? `${c.toLocaleString('es-CU')} CUP` : 'Consultar')),
    winnerIndices: [],
  });

  // Dynamically collect all spec row labels across selected products
  const allSpecLabels: string[] = [];
  for (const sp of specsList) {
    for (const r of sp.rows) {
      if (!allSpecLabels.includes(r.label)) allSpecLabels.push(r.label);
    }
  }

  for (const label of allSpecLabels) {
    const values = specsList.map((sp) => {
      const found = sp.rows.find((r) => r.label === label);
      return found ? found.value : '—';
    });

    const winnerIndices: number[] = [];
    if (clean.length > 1) {
      if (label === 'Capacidad' || label === 'Energía aprox.') {
        const whs = specsList.map((s) => s.metrics.wh || 0);
        const maxWh = Math.max(...whs);
        if (maxWh > 0) whs.forEach((v, i) => v === maxWh && winnerIndices.push(i));
      } else if (label === 'Potencia') {
        const ws = specsList.map((s) => s.metrics.watts || 0);
        const maxW = Math.max(...ws);
        if (maxW > 0) ws.forEach((v, i) => v === maxW && winnerIndices.push(i));
      } else if (label === 'Autonomía') {
        const kms = specsList.map((s) => s.metrics.km || 0);
        const maxKm = Math.max(...kms);
        if (maxKm > 0) kms.forEach((v, i) => v === maxKm && winnerIndices.push(i));
      } else if (label === 'Documentación') {
        specsList.forEach((s, i) => s.metrics.hasChapa && winnerIndices.push(i));
      } else if (label === 'Tecnología' || label === 'Batería') {
        specsList.forEach((s, i) => s.metrics.isLithium && winnerIndices.push(i));
      }
    }

    rows.push({
      key: `spec_${label.toLowerCase()}`,
      label,
      values,
      winnerIndices: winnerIndices.length < clean.length ? winnerIndices : [],
    });
  }

  // Available options / colors
  rows.push({
    key: 'variants',
    label: 'Colores / Tallas',
    values: clean.map((p) => (p.sizes && p.sizes.length > 0 ? p.sizes.join(', ') : 'Disponible')),
    winnerIndices: [],
  });

  return { products: clean, rows };
}

export type MobilityFrameType = 'suzuki_criollo' | 'triciclo' | 'electrica_bateria';

export function buildMobilityKitOptions(
  frameType: MobilityFrameType,
  products: Product[]
): {
  title: string;
  subtitle: string;
  primaryItems: Product[];
  accessoryItems: Product[];
} {
  const active = products.filter((p) => p.status === 'active' && p.department === 'movilidad');

  if (frameType === 'triciclo') {
    const engines = active.filter(
      (p) =>
        p.category_id === 'motores-baterias' &&
        /lifan|fonts|250cc|150cc|sunshine|topmaq/i.test(`${p.title} ${p.fit_note}`)
    );
    const kits = active.filter((p) => /diferencial|eje|kit/i.test(`${p.title} ${p.fit_note}`));
    return {
      title: 'Kit Remotorización / Montaje de Triciclo',
      subtitle: 'Elige la unidad o batería + el kit mecánico de diferencial y eje',
      primaryItems: engines,
      accessoryItems: kits,
    };
  }

  if (frameType === 'electrica_bateria') {
    const batteries = active.filter(
      (p) =>
        p.category_id === 'motores-baterias' &&
        /bater[ií]a|48v|60v|72v|litio|lifepo4|catl|mishozuki|sunshine|yoazaky|topmaq/i.test(
          `${p.title} ${p.fit_note}`
        )
    );
    return {
      title: 'Upgrade a Batería Litio / CATL para Motorina o Bicimoto',
      subtitle: 'Selecciona tu voltaje (48V, 60V o 72V) para multiplicar tu autonomía',
      primaryItems: batteries,
      accessoryItems: active.filter((p) => p.category_id === 'bicimotos-bicis').slice(0, 3),
    };
  }

  // Default: Suzuki / Cuadro Criollo gas remotorization
  const gasEngines = active.filter(
    (p) =>
      p.category_id === 'motores-baterias' &&
      /ax\s*100|fonts|lifan|150cc|250cc|unidad/i.test(`${p.title} ${p.fit_note}`)
  );
  const fullMotos = active.filter((p) => p.category_id === 'motos-gasolina').slice(0, 4);
  return {
    title: 'Remotorizar Cuadro Suzuki / Criollo',
    subtitle: 'Unidades completas con factura para Tránsito (AX 100, Fonts 150cc, Lifan 150/250cc)',
    primaryItems: gasEngines,
    accessoryItems: fullMotos,
  };
}

export function buildSolarKitOptions(products: Product[]): {
  inverters: Product[];
  batteries: Product[];
  panels: Product[];
} {
  const solar = products.filter((p) => p.status === 'active' && p.department === 'solares');
  return {
    inverters: solar.filter((p) => p.category_id === 'inversores'),
    batteries: solar.filter((p) => p.category_id === 'baterias-solares'),
    panels: solar.filter((p) => p.category_id === 'paneles-solares'),
  };
}

export function getCrossSellSuggestions(anchor: Product, allProducts: Product[]): Product[] {
  const active = allProducts.filter((p) => p.status === 'active' && p.id !== anchor.id);

  if (anchor.category_id === 'motores-baterias') {
    const kitOrOther = active.filter(
      (p) =>
        p.department === 'movilidad' &&
        (/diferencial|eje|bater[ií]a|lifan|fonts|motorstreck/i.test(`${p.title} ${p.fit_note}`) ||
          p.category_id === 'motores-baterias')
    );
    return kitOrOther.slice(0, 4);
  }

  if (anchor.department === 'movilidad') {
    return active
      .filter(
        (p) =>
          p.category_id === 'motores-baterias' ||
          (p.department === 'solares' && p.featured)
      )
      .slice(0, 4);
  }

  if (anchor.category_id === 'inversores') {
    return active
      .filter((p) => p.category_id === 'baterias-solares' || p.category_id === 'paneles-solares')
      .slice(0, 4);
  }

  if (anchor.category_id === 'baterias-solares') {
    return active
      .filter((p) => p.category_id === 'inversores' || p.category_id === 'paneles-solares')
      .slice(0, 4);
  }

  if (anchor.department === 'solares') {
    return active
      .filter((p) => p.category_id === 'paneles-solares' || p.category_id === 'accesorios-solares')
      .slice(0, 4);
  }

  if (anchor.department === 'calzado' || anchor.department === 'moda_shein' || anchor.department === 'hombre') {
    const acc = active.filter((p) => p.department === 'accesorios');
    const sameDept = active.filter((p) => p.department === anchor.department && p.featured);
    return [...acc.slice(0, 2), ...sameDept.slice(0, 2)].slice(0, 4);
  }

  return active.filter((p) => p.featured).slice(0, 4);
}

export function getSimilarProducts(
  anchor: Product,
  allProducts: Product[],
  preferredSize?: string
): Product[] {
  const active = allProducts.filter((p) => p.status === 'active' && p.id !== anchor.id);
  const sameCat = active.filter((p) => p.category_id === anchor.category_id);
  const sameDept = active.filter(
    (p) => p.department === anchor.department && p.category_id !== anchor.category_id
  );
  const pool = [...sameCat, ...sameDept];

  if (preferredSize && preferredSize !== 'all') {
    const withSize = pool.filter((p) => {
      const soldOut = new Set(p.sold_out_sizes || []);
      return p.sizes.includes(preferredSize) && !soldOut.has(preferredSize);
    });
    if (withSize.length > 0) return withSize.slice(0, 4);
  }
  return pool.slice(0, 4);
}

export type AssistantResponse =
  | {
      mode: 'compare';
      headline: string;
      summary: string;
      matrix: ComparisonMatrix;
      quickReplies: string[];
    }
  | {
      mode: 'solar';
      headline: string;
      summary: string;
      sizing: SolarSizingResult;
      quickReplies: string[];
    }
  | {
      mode: 'kit';
      headline: string;
      summary: string;
      frameType: MobilityFrameType | 'solar_kit';
      items: Product[];
      quickReplies: string[];
    }
  | {
      mode: 'search';
      headline: string;
      summary: string;
      products: Product[];
      intentBadges: string[];
      quickReplies: string[];
    };

export function askYoleAssistant(
  rawPrompt: string,
  products: Product[],
  categories: Category[],
  settings: StoreSettings,
  lexicon: SearchLexicon
): AssistantResponse {
  const clean = rawPrompt.trim();
  const norm = normalizeText(clean);

  // 1. Compare intent ("compara X vs Y", "diferencia entre X y Y", "X vs Y", "cual es mejor X o Y")
  const vsParts = clean
    .replace(/^(compara(?:r)?|comparame|diferencia(?:s)?\s+entre|cual\s+es\s+mejor(?:\s+entre)?)\s+/i, '')
    .split(/\s+(?:vs\.?|contra|versus)\s+|\s+y\s+(?=[a-z0-9]{2,})/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  if (
    (/\b(compara|comparar|comparame|diferencia|diferencias|versus|vs|mejor entre)\b/.test(norm) ||
      /\s+vs\.?\s+/i.test(clean)) &&
    vsParts.length >= 2
  ) {
    const picked: Product[] = [];
    const seenIds = new Set<string>();
    for (const part of vsParts.slice(0, 3)) {
      const res = filterProductsWithMeta(
        products,
        {
          department: 'all',
          categoryId: 'all',
          size: 'all',
          search: part,
          onlyPriced: false,
          includeSoldOut: false,
          sort: 'featured',
        },
        settings.usd_to_cup_rate,
        categories,
        lexicon
      );
      const best = res.products.find((p) => !seenIds.has(p.id));
      if (best) {
        seenIds.add(best.id);
        picked.push(best);
      }
    }

    if (picked.length >= 2) {
      return {
        mode: 'compare',
        headline: `Comparativa directa (${picked.length} modelos)`,
        summary: `Comparando ${picked.map((p) => p.title).join(' vs ')} con sus fichas técnicas y precios reales:`,
        matrix: buildComparisonMatrix(picked, settings),
        quickReplies: [
          'Compara EcoFlow Delta 2 vs Delta 3',
          'Compara TopMaq TANK vs Bucatti 2026',
          '¿Qué planta necesito para mi casa?',
        ],
      };
    }
  }

  // 2. Solar sizing intent
  const matchedAppliances: SolarSelectionItem[] = [];
  for (const app of SOLAR_APPLIANCES) {
    for (const kw of app.keywords) {
      const m = norm.match(new RegExp(`(?:(\\d+)\\s+)?\\b${kw}\\b`));
      if (m) {
        const qty = m[1] ? Math.min(8, Math.max(1, Number(m[1]))) : 1;
        if (!matchedAppliances.some((x) => x.id === app.id)) {
          matchedAppliances.push({ id: app.id, qty });
        }
        break;
      }
    }
  }

  const hoursMatch = norm.match(/(\d{1,2})\s*(?:horas|hora|hrs|h)\b/);
  const isSolarCalcIntent =
    matchedAppliances.length > 0 &&
    /\b(planta|estacion|necesito|aguanta|soporta|correr|encender|apagon|apagones|calcular|calcula|solar|inversor|casa|horas|watts)\b/.test(
      norm
    );

  if (isSolarCalcIntent || (matchedAppliances.length >= 2)) {
    const hours = hoursMatch ? Number(hoursMatch[1]) : 8;
    const sizing = calculateSolarSizing(
      matchedAppliances,
      hours,
      products,
      settings.usd_to_cup_rate
    );
    return {
      mode: 'solar',
      headline: `Cálculo Solar: ${sizing.continuousWatts}W continuos · ${sizing.requiredWh}Wh (${sizing.blackoutHours}h)`,
      summary: `Para alimentar ${sizing.selectedNames.join(', ')} durante ${sizing.blackoutHours}h necesitas al menos ${sizing.continuousWatts}W continuos (pico ${sizing.peakSurgeWatts}W) y ~${sizing.requiredWh}Wh de batería. Estas son tus mejores opciones en stock:`,
      sizing,
      quickReplies: [
        'Arma un kit solar completo',
        'Compara EcoFlow Delta 2 vs Bluetti',
        'Paneles solares disponibles',
      ],
    };
  }

  // 3. Kit / Remotorization intent
  if (/\b(remotorizar|arma\s+(?:un|mi)?\s*kit|armar\s+kit|cuadro\s+suzuki|cuadro\s+criollo)\b/.test(norm)) {
    if (/\b(solar|inversor|panel)\b/.test(norm)) {
      const solarKit = buildSolarKitOptions(products);
      const items = [
        solarKit.inverters[0],
        solarKit.batteries[0],
        solarKit.panels[0],
      ].filter((x): x is Product => Boolean(x));
      return {
        mode: 'kit',
        headline: 'Kit Solar Armado (Inversor + Batería + Panel)',
        summary: 'Te propongo una combinación compatible de inversor, batería LiFePO4 y panel solar. Puedes personalizar cada pieza en la pestaña "Arma tu Kit":',
        frameType: 'solar_kit',
        items,
        quickReplies: ['Ver más inversores', 'Calculadora solar', 'Compara 2 inversores'],
      };
    }

    const frameType: MobilityFrameType = /\btriciclo\b/.test(norm)
      ? 'triciclo'
      : /\b(bateria|litio|motorina)\b/.test(norm)
        ? 'electrica_bateria'
        : 'suzuki_criollo';
    const mobKit = buildMobilityKitOptions(frameType, products);
    return {
      mode: 'kit',
      headline: mobKit.title,
      summary: mobKit.subtitle,
      frameType,
      items: [...mobKit.primaryItems, ...mobKit.accessoryItems].slice(0, 6),
      quickReplies: ['Motor Lifan 250cc', 'AX 100 con factura', 'Kit diferencial triciclo'],
    };
  }

  // 4. Smart Catalog Search fallback (handles everything across all 6 departments!)
  const searchRes = filterProductsWithMeta(
    products,
    {
      department: 'all',
      categoryId: 'all',
      size: 'all',
      search: clean,
      onlyPriced: false,
      includeSoldOut: false,
      sort: 'featured',
    },
    settings.usd_to_cup_rate,
    categories,
    lexicon
  );

  if (searchRes.products.length > 0) {
    const parsedMeta = parseSmartQuery(clean, lexicon);
    return {
      mode: 'search',
      headline: `${searchRes.products.length} resultado${searchRes.products.length === 1 ? '' : 's'} para "${clean}"`,
      summary: parsedMeta.didYouMean
        ? `Entendí "${parsedMeta.didYouMean}". Aquí tienes los más relevantes en stock:`
        : `Encontré ${searchRes.products.length} opciones disponibles en tienda:`,
      products: searchRes.products.slice(0, 8),
      intentBadges: parsedMeta.intentBadges,
      quickReplies: [
        'Compara los 2 primeros',
        'Motos con chapa',
        '¿Qué planta necesito para mi casa?',
      ],
    };
  }

  return {
    mode: 'search',
    headline: 'Sin coincidencias exactas',
    summary: `No encontré "${clean}" directo, pero prueba decirme cosas como: "Compara TopMaq TANK vs Bucatti", "Planta para refri, split y 3 ventiladores", "Remotorizar cuadro Suzuki" o "Jordan 4 talla 42".`,
    products: [],
    intentBadges: [],
    quickReplies: [
      'Compara TopMaq TANK vs Bucatti 2026',
      'Planta para refri y ventiladores 8 horas',
      'Remotorizar cuadro Suzuki',
    ],
  };
}
