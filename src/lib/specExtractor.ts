import type { Product } from '../types';

export interface SpecPill {
  id: string;
  label: string;
  tone: 'accent' | 'green' | 'amber' | 'neutral';
}

export interface SpecRow {
  label: string;
  value: string;
}

export interface NumericSpecMetrics {
  voltage?: number;
  ah?: number;
  cc?: number;
  watts?: number;
  surgeWatts?: number;
  wh?: number;
  km?: number;
  mph?: number;
  hasChapa: boolean;
  isLithium: boolean;
  warrantyMonths?: number;
}

export interface ExtractedSpecs {
  pills: SpecPill[];
  rows: SpecRow[];
  metrics: NumericSpecMetrics;
}

function cleanSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function extractProductSpecs(product: Product): ExtractedSpecs {
  const source = cleanSpaces(
    `${product.title || ''} ${product.fit_note || ''} ${(product.sizes || []).join(' ')}`
  );
  const lower = source.toLowerCase();

  const pills: SpecPill[] = [];
  const rows: SpecRow[] = [];

  const metrics: NumericSpecMetrics = {
    hasChapa: false,
    isLithium: false,
  };

  // 1. Voltage & Amp-hours (e.g. 72V 45Ah, 48V / 60Ah, 51.2V 100Ah)
  const vMatch = source.match(/(\d{2}(?:\.\d+)?)\s*V\b/i);
  const ahMatches = Array.from(
    new Set(
      Array.from(source.matchAll(/(\d{2,3}(?:\.\d+)?)\s*Ah\b/gi)).map((m) =>
        Number(m[1])
      )
    )
  );
  if (vMatch) metrics.voltage = Number(vMatch[1]);
  if (ahMatches.length > 0) metrics.ah = Math.max(...ahMatches);

  if (metrics.voltage && metrics.ah) {
    const ahLabel =
      ahMatches.length > 1
        ? `${ahMatches.slice(0, 3).join('/')}Ah`
        : `${metrics.ah}Ah`;
    pills.push({ id: 'vah', label: `${metrics.voltage}V · ${ahLabel}`, tone: 'accent' });
    rows.push({ label: 'Sistema / Batería', value: `${metrics.voltage}V ${ahLabel}` });
  } else if (metrics.voltage) {
    pills.push({ id: 'v', label: `${metrics.voltage}V`, tone: 'accent' });
    rows.push({ label: 'Voltaje', value: `${metrics.voltage}V` });
  } else if (metrics.ah) {
    pills.push({ id: 'ah', label: `${metrics.ah}Ah`, tone: 'accent' });
    rows.push({ label: 'Amperaje', value: `${metrics.ah}Ah` });
  }

  // 2. Engine displacement (cc)
  const ccMatch = source.match(/(\d{2,3})\s*cc\b/i);
  const isAx100 = /\bax\s*100\b/i.test(source);
  if (ccMatch) {
    metrics.cc = Number(ccMatch[1]);
    pills.push({ id: 'cc', label: `${metrics.cc}cc`, tone: 'accent' });
    rows.push({ label: 'Cilindrada', value: `${metrics.cc}cc Combustión` });
  } else if (isAx100) {
    metrics.cc = 100;
    pills.push({ id: 'cc', label: 'AX 100cc', tone: 'accent' });
    rows.push({ label: 'Modelo / Motor', value: 'AX 100 (100cc)' });
  }

  // 3. Watts & Surge / Pico & kW
  const kwMatch = source.match(/(\d+(?:\.\d+)?)\s*kW\b/i);
  const wattMatches = Array.from(source.matchAll(/(\d{2,5})\s*W\b/gi)).map((m) =>
    Number(m[1])
  );
  const surgeMatch = source.match(/pico\s*(?:de\s*)?(\d{3,5})\s*W/i);
  if (surgeMatch) metrics.surgeWatts = Number(surgeMatch[1]);

  if (kwMatch && wattMatches.length === 0) {
    metrics.watts = Math.round(Number(kwMatch[1]) * 1000);
  } else if (wattMatches.length > 0) {
    // Base power is usually the first or non-surge wattage
    const nonSurge = wattMatches.filter((w) => w !== metrics.surgeWatts);
    metrics.watts = nonSurge.length > 0 ? nonSurge[0] : wattMatches[0];
  }

  if (metrics.watts) {
    const wLabel =
      metrics.watts >= 1000 && metrics.watts % 1000 === 0
        ? `${metrics.watts / 1000}kW`
        : `${metrics.watts}W`;
    const surgeTxt = metrics.surgeWatts ? ` (Pico ${metrics.surgeWatts}W)` : '';
    pills.push({
      id: 'watts',
      label: metrics.surgeWatts ? `${wLabel} · Pico ${metrics.surgeWatts}W` : `${wLabel}`,
      tone: 'amber',
    });
    rows.push({ label: 'Potencia', value: `${metrics.watts}W${surgeTxt}` });
  }

  // 4. Capacity Wh / kWh (Solar stations & batteries)
  const kwhMatch = source.match(/(\d+(?:\.\d+)?)\s*kWh\b/i);
  const whMatch = source.match(/(\d{3,5})\s*Wh\b/i);
  if (kwhMatch) {
    metrics.wh = Math.round(Number(kwhMatch[1]) * 1000);
    pills.push({ id: 'wh', label: `${kwhMatch[1]} kWh`, tone: 'green' });
    rows.push({ label: 'Capacidad', value: `${kwhMatch[1]} kWh (${metrics.wh}Wh)` });
  } else if (whMatch) {
    metrics.wh = Number(whMatch[1]);
    pills.push({ id: 'wh', label: `${metrics.wh}Wh`, tone: 'green' });
    rows.push({ label: 'Capacidad', value: `${metrics.wh}Wh` });
  } else if (metrics.voltage && metrics.ah && product.department === 'solares') {
    metrics.wh = Math.round(metrics.voltage * metrics.ah);
    rows.push({ label: 'Energía aprox.', value: `${metrics.wh}Wh` });
  }

  // 5. Phase / Dual output (110/220V Bifásico)
  if (/110\s*\/\s*220\s*v?|bif[aá]sic/i.test(source)) {
    pills.push({ id: 'bifasico', label: '110/220V Bifásico', tone: 'green' });
    rows.push({ label: 'Salida AC', value: '110V / 220V Bifásico' });
  } else if (/\b110v\b/i.test(source) && product.department === 'solares') {
    rows.push({ label: 'Salida AC', value: '110V' });
  }

  // 6. Battery chemistry
  if (/lifepo4|fosfato|polifosfato|catl/i.test(lower)) {
    metrics.isLithium = true;
    const chem = /catl/i.test(lower) ? 'Litio CATL' : 'LiFePO4';
    pills.push({ id: 'chem', label: chem, tone: 'green' });
    rows.push({ label: 'Tecnología', value: `${chem} (Larga vida)` });
  } else if (/\blitio\b/i.test(lower)) {
    metrics.isLithium = true;
    pills.push({ id: 'chem', label: 'Litio', tone: 'green' });
    rows.push({ label: 'Batería', value: 'Litio' });
  } else if (/\bgel\b/i.test(lower)) {
    rows.push({ label: 'Batería', value: 'Gel' });
  }

  // 7. Range & Speed
  const kmMatch = source.match(/(\d{2,3})\s*km\b/i);
  const mphMatch = source.match(/(\d{2,3})\s*mph\b/i);
  if (kmMatch) {
    metrics.km = Number(kmMatch[1]);
    pills.push({ id: 'km', label: `${metrics.km} km`, tone: 'neutral' });
    rows.push({ label: 'Autonomía', value: `${metrics.km} km aprox.` });
  }
  if (mphMatch) {
    metrics.mph = Number(mphMatch[1]);
    rows.push({ label: 'Velocidad Máx.', value: `${metrics.mph} MPH` });
  }

  // 8. Papers / Chapa / Factura / Tránsito
  if (/derecho a chapa|lista chapa|\bcon chapa\b|chapa cliente/i.test(lower)) {
    metrics.hasChapa = true;
    pills.push({ id: 'chapa', label: 'Con Chapa', tone: 'green' });
    rows.push({ label: 'Documentación', value: 'Derecho a Chapa / Papeles' });
  } else if (/remotoriz|factura|tr[aá]nsito/i.test(lower)) {
    metrics.hasChapa = true;
    pills.push({ id: 'factura', label: 'Con Factura / Tránsito', tone: 'green' });
    rows.push({ label: 'Documentación', value: 'Factura para Remotorizar / Tránsito' });
  }

  // 9. Special mechanical features
  const mechFeatures: string[] = [];
  if (/volteo hidr[aá]ulico/i.test(lower)) mechFeatures.push('Volteo Hidráulico');
  if (/panel solar/i.test(lower) && product.department === 'movilidad') mechFeatures.push('Con Panel Solar');
  if (/caja 6ta|6ta/i.test(lower)) mechFeatures.push('Caja 6ta');
  if (/card[aá]n/i.test(lower)) mechFeatures.push('Transmisión Cardán');
  if (/enfriado por agua/i.test(lower)) mechFeatures.push('Enfriado por Agua');
  if (/diferencial/i.test(lower)) mechFeatures.push('Diferencial y Eje');
  if (/plegable|doblable/i.test(lower)) mechFeatures.push('Plegable');
  if (/shimano/i.test(lower)) mechFeatures.push('Cambios Shimano');
  if (/bluetooth/i.test(lower)) mechFeatures.push('Audio Bluetooth');
  if (/mppt/i.test(lower)) mechFeatures.push('Controlador MPPT');
  if (mechFeatures.length > 0) {
    pills.push({ id: 'mech', label: mechFeatures[0], tone: 'neutral' });
    rows.push({ label: 'Destacado', value: mechFeatures.join(' · ') });
  }

  // 10. Warranty
  const warMatch = source.match(/(\d{1,2})\s*(meses|a[nñ]os?)\s*(?:de\s*)?garant/i)
    || source.match(/garant[ií]a\s*(?:de\s*)?(\d{1,2})\s*(meses|a[nñ]os?)/i);
  if (warMatch) {
    const qty = Number(warMatch[1]);
    const unit = warMatch[2].toLowerCase().startsWith('a') ? 'año(s)' : 'meses';
    metrics.warrantyMonths = unit.startsWith('a') ? qty * 12 : qty;
    rows.push({ label: 'Garantía', value: `${qty} ${unit}` });
  }

  // Fallback for general products
  if (rows.length === 0 && product.quality) {
    rows.push({ label: 'Calidad', value: product.quality });
  }

  return { pills, rows, metrics };
}
