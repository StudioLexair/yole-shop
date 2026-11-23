import type { Category, Department, Product } from '../types';
import { priceInCup, priceInUsd } from './pricing';

export interface SearchLexicon {
  brands: string[];
  brandNormMap: Map<string, string>;
  categoryNames: string[];
  categoryMap: Map<string, Category>;
  vocabWords: string[];
  vocabPrettyMap: Map<string, string>;
}

export interface ParsedSmartQuery {
  raw: string;
  normalized: string;
  correctedQuery: string;
  didYouMean: string | null;
  textTokens: string[];
  correctedTokens: string[];
  departmentHints: Department[];
  minUsd: number | null;
  maxUsd: number | null;
  minCup: number | null;
  maxCup: number | null;
  sizeHint: string | null;
  featuredOnlyHint: boolean;
  priceIntentLabel: string | null;
}

export function normalizeText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.+\-<>$]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseRepeats(token: string): string {
  // Collapse 3+ identical chars or double trailing letters like neww -> new, nikee -> nike
  return token.replace(/(.)\1{2,}/g, '$1').replace(/([a-z])\1$/g, '$1');
}

function phoneticKey(token: string): string {
  return collapseRepeats(token)
    .replace(/qu/g, 'k')
    .replace(/[ck]/g, 'k')
    .replace(/v/g, 'b')
    .replace(/z/g, 's')
    .replace(/ce/g, 'se')
    .replace(/ci/g, 'si')
    .replace(/ll/g, 'y')
    .replace(/^h/, '')
    .replace(/sh/g, 'ch');
}

function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + cost);
      }
      dp[i][j] = val;
    }
  }
  return dp[m][n];
}

// Genuine spelling/phonetic typos (triggers "¿Quisiste decir ...?")
const TOKEN_ALIASES: Record<string, string> = {
  neww: 'new',
  nw: 'new',
  balanc: 'balance',
  balanse: 'balance',
  balnce: 'balance',
  balace: 'balance',
  yordan: 'jordan',
  yordans: 'jordan',
  jordam: 'jordan',
  jodan: 'jordan',
  shien: 'shein',
  sheym: 'shein',
  sheyn: 'shein',
  chein: 'shein',
  shain: 'shein',
  naik: 'nike',
  naiki: 'nike',
  nikee: 'nike',
  adiddas: 'adidas',
  addidas: 'adidas',
  adida: 'adidas',
  osirs: 'osiris',
  osiriss: 'osiris',
  champon: 'champion',
  conberse: 'converse',
  converce: 'converse',
  diorr: 'dior',
  vestdo: 'vestido',
  vestdos: 'vestidos',
  sudadra: 'sudadera',
  hoddie: 'hoodie',
  hoody: 'hoodie',
  pantlon: 'pantalon',
  relog: 'reloj',
  reloges: 'relojes',
  tenni: 'tenis',
  teniss: 'tenis',
  legin: 'leggings',
  legins: 'leggings',
};

const SYNONYM_GROUPS: Record<string, string[]> = {
  tenis: ['tenis', 'calzado', 'zapatilla', 'zapatillas', 'zapato', 'zapatos', 'sneaker'],
  zapatos: ['tenis', 'calzado', 'zapatillas', 'zapato', 'zapatos'],
  zapato: ['tenis', 'calzado', 'zapatillas', 'zapato', 'zapatos'],
  zapatillas: ['tenis', 'calzado', 'zapatillas', 'zapatos'],
  zapatilla: ['tenis', 'calzado', 'zapatillas', 'zapatos'],
  calzado: ['tenis', 'calzado', 'zapatillas', 'zapatos'],
  jordans: ['jordan'],
  champions: ['champion'],
  ropa: ['shein', 'vestido', 'blusa', 'sudadera', 'pantalon', 'conjunto', 'short', 'top', 'moda'],
  moda: ['shein', 'vestido', 'blusa', 'sudadera', 'pantalon', 'conjunto', 'top'],
  mujer: ['vestido', 'blusa', 'corse', 'falda', 'leggings', 'mujer', 'shein'],
  dama: ['vestido', 'blusa', 'corse', 'falda', 'leggings', 'mujer', 'shein'],
  chica: ['vestido', 'blusa', 'corse', 'falda', 'leggings', 'mujer'],
  hombre: ['hombre', 'sudadera', 'hoodie', 'camiseta', 'playera', 'bermuda'],
  caballero: ['hombre', 'sudadera', 'hoodie', 'camiseta'],
  chico: ['hombre', 'sudadera', 'hoodie', 'camiseta'],
  bolso: ['bolso', 'cartera', 'mochila', 'bandolera'],
  bolsos: ['bolso', 'cartera', 'mochila', 'bandolera'],
  cartera: ['cartera', 'bolso', 'bandolera'],
  carteras: ['cartera', 'bolso', 'bandolera'],
  reloj: ['reloj', 'relojes', 'olevs', 'cronografo'],
  relojes: ['reloj', 'relojes', 'olevs', 'cronografo'],
  sudadera: ['sudadera', 'hoodie', 'abrigo', 'sueter', 'enguatada'],
  sudaderas: ['sudadera', 'hoodie', 'abrigo', 'sueter', 'enguatada'],
  hoodie: ['hoodie', 'sudadera', 'abrigo', 'sueter'],
  hoodies: ['hoodie', 'sudadera', 'abrigo', 'sueter'],
  abrigo: ['abrigo', 'sudadera', 'hoodie', 'enguatada', 'chaqueta'],
  abrigos: ['abrigo', 'sudadera', 'hoodie', 'enguatada', 'chaqueta'],
  vestido: ['vestido', 'vestidos'],
  vestidos: ['vestido', 'vestidos'],
  blusa: ['blusa', 'blusas', 'top', 'corse', 'camisa'],
  blusas: ['blusa', 'blusas', 'top', 'corse', 'camisa'],
  corset: ['corse', 'corset', 'blusa', 'top'],
  corse: ['corse', 'corset', 'blusa', 'top'],
  pantalon: ['pantalon', 'pantalones', 'jeans', 'mezclilla', 'leggings'],
  pantalones: ['pantalon', 'pantalones', 'jeans', 'mezclilla', 'leggings'],
  accesorios: ['accesorios', 'cartera', 'bolso', 'reloj', 'gafas', 'gorra'],
};

const STOP_WORDS = new Set([
  'de',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'para',
  'con',
  'sin',
  'en',
  'por',
  'del',
  'y',
  'o',
  'que',
  'quiero',
  'busco',
]);

export function buildSearchLexicon(products: Product[], categories: Category[]): SearchLexicon {
  const brandNormMap = new Map<string, string>();
  const categoryMap = new Map<string, Category>();
  const vocabPrettyMap = new Map<string, string>();

  const registerWord = (word: string, pretty: string) => {
    if (word.length < 3) return;
    if (!vocabPrettyMap.has(word)) {
      vocabPrettyMap.set(word, pretty);
    }
  };

  for (const c of categories) {
    categoryMap.set(c.id, c);
    const normCat = normalizeText(c.name);
    for (const part of normCat.split(' ')) {
      registerWord(part, part.charAt(0).toUpperCase() + part.slice(1));
    }
  }

  for (const p of products) {
    if (p.status === 'hidden') continue;
    if (p.brand) {
      const nb = normalizeText(p.brand);
      if (nb && !brandNormMap.has(nb)) {
        brandNormMap.set(nb, p.brand.trim());
      }
      for (const part of nb.split(' ')) {
        registerWord(part, part.charAt(0).toUpperCase() + part.slice(1));
      }
    }
    const titleParts = p.title.split(/\s+/);
    for (const rawWord of titleParts) {
      const nw = normalizeText(rawWord);
      if (nw && !/^\d+$/.test(nw) && !STOP_WORDS.has(nw)) {
        registerWord(nw, rawWord.replace(/[^\p{L}\p{N}-]/gu, ''));
      }
    }
  }

  // Ensure key domain words exist even on small/filtered mocks
  for (const base of [
    ['jordan', 'Jordan'],
    ['new', 'New'],
    ['balance', 'Balance'],
    ['nike', 'Nike'],
    ['adidas', 'Adidas'],
    ['osiris', 'Osiris'],
    ['champion', 'Champion'],
    ['shein', 'SHEIN'],
    ['dior', 'Dior'],
    ['vestido', 'Vestido'],
    ['vestidos', 'Vestidos'],
    ['blusa', 'Blusa'],
    ['sudadera', 'Sudadera'],
    ['hoodie', 'Hoodie'],
    ['cartera', 'Cartera'],
    ['reloj', 'Reloj'],
    ['pantalon', 'Pantalón'],
    ['tenis', 'Tenis'],
    ['accesorios', 'Accesorios'],
  ] as const) {
    registerWord(base[0], base[1]);
  }

  return {
    brands: Array.from(brandNormMap.values()),
    brandNormMap,
    categoryNames: categories.map((c) => c.name),
    categoryMap,
    vocabWords: Array.from(vocabPrettyMap.keys()),
    vocabPrettyMap,
  };
}

function correctSingleToken(
  token: string,
  lexicon: SearchLexicon
): { corrected: string; changed: boolean } {
  if (!token || /^\d+(\.\d+)?$/.test(token) || token.startsWith('yol-')) {
    return { corrected: token, changed: false };
  }
  if (STOP_WORDS.has(token)) {
    return { corrected: token, changed: false };
  }

  // Exact known vocabulary or synonym key
  if (lexicon.vocabPrettyMap.has(token) || SYNONYM_GROUPS[token]) {
    return { corrected: token, changed: false };
  }

  // Direct alias map (neww -> new, yordan -> jordan, shien -> shein)
  if (TOKEN_ALIASES[token]) {
    return { corrected: TOKEN_ALIASES[token], changed: true };
  }

  // Collapsed repeats (nikee -> nike, neww -> new)
  const squeezed = collapseRepeats(token);
  if (squeezed !== token && (lexicon.vocabPrettyMap.has(squeezed) || TOKEN_ALIASES[squeezed])) {
    return { corrected: TOKEN_ALIASES[squeezed] || squeezed, changed: true };
  }

  // Only attempt edit distance for words >= 4 chars
  if (token.length < 4) {
    return { corrected: token, changed: false };
  }

  const maxDist = token.length >= 6 ? 2 : 1;
  const tokPhon = phoneticKey(token);
  let bestWord = token;
  let bestScore = Infinity;

  for (const cand of lexicon.vocabWords) {
    if (Math.abs(cand.length - token.length) > 2) continue;
    const dist = damerauLevenshtein(token, cand);
    const phonDist = damerauLevenshtein(tokPhon, phoneticKey(cand));
    const score = Math.min(dist, phonDist + 0.35);
    if (score <= maxDist && score < bestScore) {
      bestScore = score;
      bestWord = cand;
    }
  }

  return {
    corrected: bestWord,
    changed: bestWord !== token,
  };
}

function formatSuggestionPhrase(tokens: string[], lexicon: SearchLexicon): string {
  const joined = tokens.join(' ');
  // Known brand casing check (e.g., "new balance" -> "New Balance", "shein" -> "SHEIN")
  for (const [normBrand, prettyBrand] of lexicon.brandNormMap.entries()) {
    if (joined === normBrand) return prettyBrand;
  }
  return tokens
    .map((t) => lexicon.vocabPrettyMap.get(t) || t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ');
}

export function parseSmartQuery(
  rawQuery: string,
  lexicon: SearchLexicon
): ParsedSmartQuery {
  let working = normalizeText(rawQuery);
  let minUsd: number | null = null;
  let maxUsd: number | null = null;
  let minCup: number | null = null;
  let maxCup: number | null = null;
  let sizeHint: string | null = null;
  let featuredOnlyHint = false;
  let priceIntentLabel: string | null = null;

  // Shorthand "nb" -> "new balance"
  working = working.replace(/\bnb\b/g, 'new balance');

  // Range: "entre 15 y 30" or "15 a 30 usd"
  const rangeMatch = working.match(
    /(?:entre\s+)?(\d+(?:\.\d+)?)\s*(?:y|a|-)\s*(\d+(?:\.\d+)?)\s*(usd|cup|\$)?/
  );
  if (rangeMatch) {
    const a = parseFloat(rangeMatch[1]);
    const b = parseFloat(rangeMatch[2]);
    const unit = rangeMatch[3];
    if (unit === 'cup' || b >= 500) {
      minCup = Math.min(a, b);
      maxCup = Math.max(a, b);
      priceIntentLabel = `${minCup.toLocaleString('es-CU')}–${maxCup.toLocaleString('es-CU')} CUP`;
    } else {
      minUsd = Math.min(a, b);
      maxUsd = Math.max(a, b);
      priceIntentLabel = `$${minUsd}–$${maxUsd} USD`;
    }
    working = working.replace(rangeMatch[0], ' ');
  }

  // Upper bound: "menos de 20", "hasta 15", "bajo 25", "< 20", "menor a 20"
  const underMatch = working.match(
    /(?:menos de|menor a|menor de|hasta|bajo|debajo de|maximo|max|<)\s*\$?\s*(\d+(?:\.\d+)?)\s*(usd|cup|\$)?/
  );
  if (underMatch) {
    const val = parseFloat(underMatch[1]);
    const unit = underMatch[2];
    if (unit === 'cup' || val >= 500) {
      maxCup = val;
      priceIntentLabel = `Hasta ${val.toLocaleString('es-CU')} CUP`;
    } else {
      maxUsd = val;
      priceIntentLabel = `Hasta $${val} USD`;
    }
    working = working.replace(underMatch[0], ' ');
  }

  // Lower bound: "mas de 30", "+30", "mayor de 30", "> 30"
  const overMatch = working.match(
    /(?:mas de|mayor a|mayor de|desde|minimo|min|\+|>)\s*\$?\s*(\d+(?:\.\d+)?)\s*(usd|cup|\$)?/
  );
  if (overMatch) {
    const val = parseFloat(overMatch[1]);
    const unit = overMatch[2];
    if (unit === 'cup' || val >= 500) {
      minCup = val;
      priceIntentLabel = `Más de ${val.toLocaleString('es-CU')} CUP`;
    } else {
      minUsd = val;
      priceIntentLabel = `+$${val} USD`;
    }
    working = working.replace(overMatch[0], ' ');
  }

  // Explicit size phrase: "talla 38", "talla m"
  const sizeMatch = working.match(/\btalla\s+([a-z0-9.]+)\b/);
  if (sizeMatch) {
    sizeHint = sizeMatch[1].toUpperCase();
    working = working.replace(sizeMatch[0], ' ');
  }

  // Budget adjectives: "baratos", "economicos"
  if (/\b(barato|baratos|barata|baratas|economico|economicos|economica|economicas)\b/.test(working)) {
    if (maxUsd === null && maxCup === null) {
      maxUsd = 15;
      priceIntentLabel = 'Económicos (≤ $15 USD)';
    }
    working = working.replace(
      /\b(barato|baratos|barata|baratas|economico|economicos|economica|economicas)\b/g,
      ' '
    );
  }

  if (/\b(destacados|favoritos top|mas pedido)\b/.test(working)) {
    featuredOnlyHint = true;
    working = working.replace(/\b(destacados|mas pedido)\b/g, ' ');
  }

  const rawTokens = normalizeText(working)
    .replace(/[<>$]+/g, ' ')
    .split(' ')
    .filter((t) => t && !STOP_WORDS.has(t));

  const correctedTokens: string[] = [];
  let anyChanged = false;
  for (const tok of rawTokens) {
    const res = correctSingleToken(tok, lexicon);
    correctedTokens.push(res.corrected);
    if (res.changed) anyChanged = true;
  }

  // Detect department hints for stronger relevance
  const departmentHints: Department[] = [];
  const joinedCorrected = correctedTokens.join(' ');
  if (/\b(tenis|zapatillas|zapatos|calzado)\b/.test(joinedCorrected)) {
    departmentHints.push('calzado');
  }
  if (/\b(hombre|caballero|chico)\b/.test(joinedCorrected)) {
    departmentHints.push('hombre');
  }
  if (/\b(mujer|dama|chica|vestido|vestidos|blusa|corse|falda|leggings)\b/.test(joinedCorrected)) {
    departmentHints.push('moda_shein');
  }
  if (/\b(accesorios|cartera|bolso|reloj|relojes|mochila)\b/.test(joinedCorrected)) {
    departmentHints.push('accesorios');
  }

  const correctedQuery = correctedTokens.join(' ');
  const didYouMean =
    anyChanged && correctedTokens.length > 0
      ? formatSuggestionPhrase(correctedTokens, lexicon)
      : null;

  return {
    raw: rawQuery,
    normalized: normalizeText(rawQuery),
    correctedQuery,
    didYouMean,
    textTokens: rawTokens,
    correctedTokens,
    departmentHints,
    minUsd,
    maxUsd,
    minCup,
    maxCup,
    sizeHint,
    featuredOnlyHint,
    priceIntentLabel,
  };
}

function tokenMatchesHaystack(token: string, hay: string, dept: Department): boolean {
  if (hay.includes(token)) return true;
  const syns = SYNONYM_GROUPS[token];
  if (syns) {
    if (syns.some((s) => hay.includes(s))) return true;
    if (
      (token === 'tenis' || token === 'calzado' || token === 'zapatos' || token === 'zapatillas') &&
      dept === 'calzado'
    ) {
      return true;
    }
    if ((token === 'hombre' || token === 'caballero' || token === 'chico') && dept === 'hombre') {
      return true;
    }
    if (
      (token === 'mujer' || token === 'dama' || token === 'chica') &&
      dept === 'moda_shein'
    ) {
      return true;
    }
    if (token === 'accesorios' && dept === 'accesorios') {
      return true;
    }
    if ((token === 'ropa' || token === 'moda') && (dept === 'moda_shein' || dept === 'hombre')) {
      return true;
    }
  }
  return false;
}

export function matchSmartProduct(
  product: Product,
  parsed: ParsedSmartQuery,
  categoryName: string,
  usdToCupRate: number,
  availableSizes: string[]
): { matches: boolean; score: number } {
  // Price intent checks
  if (parsed.minUsd !== null || parsed.maxUsd !== null) {
    const usd = priceInUsd(product.price, product.currency, usdToCupRate);
    if (usd === null) return { matches: false, score: 0 };
    if (parsed.minUsd !== null && usd < parsed.minUsd) return { matches: false, score: 0 };
    if (parsed.maxUsd !== null && usd > parsed.maxUsd) return { matches: false, score: 0 };
  }
  if (parsed.minCup !== null || parsed.maxCup !== null) {
    const cup = priceInCup(product.price, product.currency, usdToCupRate);
    if (cup === null) return { matches: false, score: 0 };
    if (parsed.minCup !== null && cup < parsed.minCup) return { matches: false, score: 0 };
    if (parsed.maxCup !== null && cup > parsed.maxCup) return { matches: false, score: 0 };
  }

  if (parsed.sizeHint) {
    const sizeMatch = availableSizes.some(
      (s) => normalizeText(s) === normalizeText(parsed.sizeHint || '')
    );
    if (!sizeMatch) return { matches: false, score: 0 };
  }

  if (parsed.featuredOnlyHint && !product.featured) {
    return { matches: false, score: 0 };
  }

  const tokens = parsed.correctedTokens;
  if (tokens.length === 0) {
    return { matches: true, score: product.featured ? 10 : 1 };
  }

  const deptText =
    product.department === 'calzado'
      ? 'calzado tenis zapatos'
      : product.department === 'hombre'
        ? 'moda hombre caballero ropa'
        : product.department === 'moda_shein'
          ? 'moda shein mujer dama ropa'
          : 'accesorios carteras relojes';

  const hay = normalizeText(
    `${product.sku} ${product.title} ${product.brand} ${categoryName} ${deptText} ${product.quality} ${product.fit_note} ${availableSizes.join(' ')}`
  );

  if (!tokens.every((t) => tokenMatchesHaystack(t, hay, product.department))) {
    return { matches: false, score: 0 };
  }

  // Relevance score for ordering search results
  let score = 0;
  const skuNorm = normalizeText(product.sku);
  const titleNorm = normalizeText(product.title);
  const brandNorm = normalizeText(product.brand);
  const catNorm = normalizeText(categoryName);

  if (skuNorm === parsed.correctedQuery) score += 100;
  if (brandNorm === parsed.correctedQuery) score += 60;
  if (titleNorm.includes(parsed.correctedQuery)) score += 45;
  if (catNorm.includes(parsed.correctedQuery)) score += 30;
  for (const t of tokens) {
    if (titleNorm.includes(t)) score += 15;
    if (brandNorm.includes(t)) score += 12;
    if (catNorm.includes(t)) score += 8;
  }
  if (product.featured) score += 4;

  return { matches: true, score };
}

export interface SearchSuggestionsResult {
  didYouMean: string | null;
  priceIntentLabel: string | null;
  quickChips: string[];
  topProducts: Product[];
}

export function buildSearchSuggestions(
  query: string,
  products: Product[],
  categories: Category[],
  usdToCupRate: number,
  lexicon: SearchLexicon
): SearchSuggestionsResult {
  const parsed = parseSmartQuery(query, lexicon);
  const active = products.filter((p) => p.status === 'active');

  if (!parsed.normalized) {
    return {
      didYouMean: null,
      priceIntentLabel: null,
      quickChips: [
        'New Balance',
        'Air Jordan',
        'Vestidos',
        'Hasta $15',
        'Tenis menos de $35',
        'Hombre',
        'Carteras',
        'Relojes',
      ],
      topProducts: [],
    };
  }

  const scored: Array<{ product: Product; score: number }> = [];
  for (const p of active) {
    const catName = lexicon.categoryMap.get(p.category_id)?.name || '';
    const soldSet = new Set(p.sold_out_sizes || []);
    const availSizes = p.sizes.filter((s) => s && !soldSet.has(s));
    const res = matchSmartProduct(p, parsed, catName, usdToCupRate, availSizes);
    if (res.matches) {
      scored.push({ product: p, score: res.score });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  const chipSet = new Set<string>();
  for (const b of lexicon.brands) {
    if (normalizeText(b).includes(parsed.correctedQuery) || parsed.correctedTokens.some((t) => normalizeText(b).includes(t))) {
      chipSet.add(b);
    }
  }
  for (const c of categories) {
    if (
      normalizeText(c.name).includes(parsed.correctedQuery) ||
      parsed.correctedTokens.some((t) => normalizeText(c.name).includes(t))
    ) {
      chipSet.add(c.name);
    }
  }
  if (parsed.didYouMean) {
    chipSet.add(parsed.didYouMean);
  }

  return {
    didYouMean: parsed.didYouMean,
    priceIntentLabel: parsed.priceIntentLabel,
    quickChips: Array.from(chipSet).slice(0, 6),
    topProducts: scored.slice(0, 4).map((x) => x.product),
  };
}
