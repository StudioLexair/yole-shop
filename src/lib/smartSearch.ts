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

export type SmartSortIntent = 'price_asc' | 'price_desc' | 'featured' | null;

export interface ParsedSmartQuery {
  raw: string;
  normalized: string;
  correctedQuery: string;
  didYouMean: string | null;
  textTokens: string[];
  correctedTokens: string[];
  departmentHints: Department[];
  detectedBrand: string | null;
  minUsd: number | null;
  maxUsd: number | null;
  minCup: number | null;
  maxCup: number | null;
  sizeHint: string | null;
  featuredOnlyHint: boolean;
  sortIntent: SmartSortIntent;
  priceIntentLabel: string | null;
  intentBadges: string[];
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
  campuss: 'campus',
  sambaa: 'samba',
  shoxx: 'shox',
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
  ecofow: 'ecoflow',
  ecoflo: 'ecoflow',
  ecofloww: 'ecoflow',
  blueti: 'bluetti',
  bluetty: 'bluetti',
  bluety: 'bluetti',
  vateria: 'bateria',
  baterya: 'bateria',
  motrina: 'motorina',
  motornia: 'motorina',
  bicmoto: 'bicimoto',
  tricico: 'triciclo',
  tricilo: 'triciclo',
  inbersor: 'inversor',
  imbresor: 'inversor',
  panell: 'panel',
  sandlia: 'sandalia',
  sueco: 'zueco',
  suecos: 'zuecos',
  audifno: 'audifonos',
  audifono: 'audifonos',
  pulober: 'pulover',
  yoasaki: 'yoazaky',
  topmak: 'topmaq',
  unisuki: 'unizuki',
  bedca: 'vedca',
  bukati: 'bucatti',
  bucati: 'bucatti',
  lifepo: 'lifepo4',
  lipo: 'litio',
  lition: 'litio',
};

const COLOR_NORMALIZATIONS: Record<string, string> = {
  negras: 'negro',
  negros: 'negro',
  negra: 'negro',
  blancas: 'blanco',
  blancos: 'blanco',
  blanca: 'blanco',
  rojas: 'rojo',
  rojos: 'rojo',
  roja: 'rojo',
  azules: 'azul',
  verdes: 'verde',
  grises: 'gris',
  rosadas: 'rosa',
  rosados: 'rosa',
  rosado: 'rosa',
  rosada: 'rosa',
  rosas: 'rosa',
  marrones: 'marron',
  cafes: 'cafe',
  doradas: 'dorado',
  dorados: 'dorado',
  dorada: 'dorado',
  plateadas: 'plateado',
  plateados: 'plateado',
  plateada: 'plateado',
  plata: 'plata',
  moradas: 'morado',
  morados: 'morado',
  morada: 'morado',
  amarillas: 'amarillo',
  amarillos: 'amarillo',
  amarilla: 'amarillo',
  vinos: 'vino',
  beiges: 'beige',
  cremas: 'crema',
};

const SYNONYM_GROUPS: Record<string, string[]> = {
  tenis: ['tenis', 'calzado', 'zapatilla', 'zapatillas', 'zapato', 'zapatos', 'sneaker'],
  zapatos: ['tenis', 'calzado', 'zapatillas', 'zapato', 'zapatos'],
  zapato: ['tenis', 'calzado', 'zapatillas', 'zapato', 'zapatos'],
  zapatillas: ['tenis', 'calzado', 'zapatillas', 'zapatos'],
  zapatilla: ['tenis', 'calzado', 'zapatillas', 'zapatos'],
  calzado: ['tenis', 'calzado', 'zapatillas', 'zapatos'],
  zueco: ['zueco', 'zuecos', 'sandalia', 'sandalias', 'boston', 'hermes'],
  zuecos: ['zueco', 'zuecos', 'sandalia', 'sandalias', 'boston', 'hermes'],
  sandalia: ['sandalia', 'sandalias', 'zueco', 'zuecos', 'tacon', 'hermes'],
  sandalias: ['sandalia', 'sandalias', 'zueco', 'zuecos', 'tacon', 'hermes'],
  chancleta: ['zueco', 'zuecos', 'sandalia', 'sandalias', 'plana'],
  chancletas: ['zueco', 'zuecos', 'sandalia', 'sandalias', 'plana'],
  chancla: ['zueco', 'zuecos', 'sandalia', 'sandalias', 'plana'],
  chanclas: ['zueco', 'zuecos', 'sandalia', 'sandalias', 'plana'],
  crocs: ['zueco', 'zuecos', 'boston'],
  birkenstock: ['zueco', 'zuecos', 'boston'],
  tacon: ['tacon', 'sandalia', 'slingback'],
  tacones: ['tacon', 'sandalia', 'slingback'],
  bota: ['bota', 'tactica', 'militar'],
  botas: ['bota', 'tactica', 'militar'],
  jordans: ['jordan'],
  champions: ['champion'],
  ropa: ['shein', 'vestido', 'blusa', 'sudadera', 'pantalon', 'conjunto', 'short', 'top', 'moda'],
  moda: ['shein', 'vestido', 'blusa', 'sudadera', 'pantalon', 'conjunto', 'top'],
  mujer: ['vestido', 'blusa', 'corse', 'corset', 'falda', 'leggings', 'mujer', 'shein', 'sandalia', 'zueco'],
  dama: ['vestido', 'blusa', 'corse', 'corset', 'falda', 'leggings', 'mujer', 'shein', 'sandalia'],
  chica: ['vestido', 'blusa', 'corse', 'corset', 'falda', 'leggings', 'mujer'],
  hombre: ['hombre', 'sudadera', 'hoodie', 'camiseta', 'playera', 'bermuda', 'pulover', 'jean', 'enguatada'],
  caballero: ['hombre', 'sudadera', 'hoodie', 'camiseta', 'pulover'],
  chico: ['hombre', 'sudadera', 'hoodie', 'camiseta', 'pulover'],
  bolso: ['bolso', 'cartera', 'mochila', 'bandolera'],
  bolsos: ['bolso', 'cartera', 'mochila', 'bandolera'],
  cartera: ['cartera', 'bolso', 'bandolera'],
  carteras: ['cartera', 'bolso', 'bandolera'],
  reloj: ['reloj', 'relojes', 'olevs', 'casio', 'cronografo'],
  relojes: ['reloj', 'relojes', 'olevs', 'casio', 'cronografo'],
  audifonos: ['audifonos', 'bluetooth', 'tws', 'inalambricos', 'p9'],
  cascos: ['audifonos', 'bluetooth', 'p9'],
  bluetooth: ['bluetooth', 'audifonos', 'tws', 'bms'],
  sudadera: ['sudadera', 'hoodie', 'abrigo', 'sueter', 'enguatada'],
  sudaderas: ['sudadera', 'hoodie', 'abrigo', 'sueter', 'enguatada'],
  hoodie: ['hoodie', 'sudadera', 'abrigo', 'sueter'],
  hoodies: ['hoodie', 'sudadera', 'abrigo', 'sueter'],
  abrigo: ['abrigo', 'sudadera', 'hoodie', 'enguatada', 'chaqueta'],
  abrigos: ['abrigo', 'sudadera', 'hoodie', 'enguatada', 'chaqueta'],
  pulover: ['pulover', 'camiseta', 'polo', 'oversize'],
  pulovers: ['pulover', 'camiseta', 'polo', 'oversize'],
  camiseta: ['camiseta', 'pulover', 'polo', 'jersey', 'oversize'],
  camisetas: ['camiseta', 'pulover', 'polo', 'jersey', 'oversize'],
  playera: ['camiseta', 'pulover', 'polo'],
  vestido: ['vestido', 'vestidos'],
  vestidos: ['vestido', 'vestidos'],
  blusa: ['blusa', 'blusas', 'top', 'corse', 'corset', 'camisa', 'bustier'],
  blusas: ['blusa', 'blusas', 'top', 'corse', 'corset', 'camisa', 'bustier'],
  corset: ['corse', 'corset', 'bustier', 'blusa', 'top'],
  corse: ['corse', 'corset', 'bustier', 'blusa', 'top'],
  falda: ['falda', 'minifalda'],
  saya: ['falda', 'minifalda'],
  sayas: ['falda', 'minifalda'],
  pantalon: ['pantalon', 'pantalones', 'jean', 'jeans', 'mezclilla', 'leggings', 'cargo', 'mono'],
  pantalones: ['pantalon', 'pantalones', 'jean', 'jeans', 'mezclilla', 'leggings', 'cargo', 'mono'],
  jean: ['jean', 'baggy', 'denim', 'pantalon', 'cargo'],
  jeans: ['jean', 'baggy', 'denim', 'pantalon', 'cargo'],
  mezclilla: ['jean', 'baggy', 'denim'],
  licra: ['leggings', 'mono', 'jogger'],
  accesorios: ['accesorios', 'cartera', 'bolso', 'reloj', 'audifonos', 'casio', 'olevs'],
  moto: ['moto', 'motos', 'motorina', 'motorinas', 'motoneta', 'gasolina', 'electrica', 'chapa'],
  motos: ['moto', 'motos', 'motorina', 'motorinas', 'motoneta', 'gasolina', 'electrica', 'chapa'],
  motorina: ['motorina', 'motorinas', 'moto', 'scooter', 'electrica', 'bicimoto'],
  motorinas: ['motorina', 'motorinas', 'moto', 'scooter', 'electrica', 'bicimoto'],
  motico: ['motorina', 'bicimoto', 'bici', 'scooter'],
  pasola: ['motorina', 'scooter', 'bicimoto'],
  bicimoto: ['bicimoto', 'bicimotos', 'bici', 'bicicleta', 'electrica'],
  bicimotos: ['bicimoto', 'bicimotos', 'bici', 'bicicleta', 'electrica'],
  bici: ['bici', 'bicicleta', 'bicimoto', 'plegable', 'eskute', 'tamobyke'],
  triciclo: ['triciclo', 'triciclos', 'carga', 'pasajero', 'techo'],
  triciclos: ['triciclo', 'triciclos', 'carga', 'pasajero', 'techo'],
  bateria: ['bateria', 'baterias', 'litio', 'lifepo4', 'polifosfato', 'gel', 'catl'],
  baterias: ['bateria', 'baterias', 'litio', 'lifepo4', 'polifosfato', 'gel', 'catl'],
  pila: ['bateria', 'baterias', 'litio', 'lifepo4'],
  litio: ['litio', 'lifepo4', 'catl', 'bateria'],
  motor: ['motor', 'motores', 'unidad', 'chapa', 'kit', 'lifan'],
  virginia: ['virginia', 'moto', 'motorina', 'triciclo', 'bicimoto', 'bateria'],
  solar: ['solar', 'solares', 'panel', 'paneles', 'inversor', 'estacion', 'lifepo4', 'ecoflow', 'bluetti'],
  solares: ['solar', 'solares', 'panel', 'paneles', 'inversor', 'estacion', 'lifepo4', 'ecoflow', 'bluetti'],
  panel: ['panel', 'paneles', 'solar', 'solares', 'bifacial', 'longi', 'meyer'],
  paneles: ['panel', 'paneles', 'solar', 'solares', 'bifacial', 'longi', 'meyer'],
  placa: ['panel', 'paneles', 'solar', 'solares', 'bifacial'],
  placas: ['panel', 'paneles', 'solar', 'solares', 'bifacial'],
  inversor: ['inversor', 'inversores', 'hibrido', 'mppt', 'powmr', 'sumry', 'must', 'kit', 'ecoworthy'],
  inversores: ['inversor', 'inversores', 'hibrido', 'mppt', 'powmr', 'sumry', 'must', 'kit'],
  estacion: ['estacion', 'estaciones', 'ecoflow', 'bluetti', 'anker', 'ampace', 'oupes', 'aferry', 'energia', 'portatil'],
  estaciones: ['estacion', 'estaciones', 'ecoflow', 'bluetti', 'anker', 'ampace', 'oupes', 'aferry', 'energia', 'portatil'],
  planta: ['estacion', 'ecoflow', 'bluetti', 'anker', 'ampace', 'oupes', 'aferry', 'planta', 'respaldo', 'hibrido'],
  plantas: ['estacion', 'ecoflow', 'bluetti', 'anker', 'ampace', 'oupes', 'aferry', 'planta', 'respaldo'],
  apagon: ['estacion', 'ecoflow', 'bluetti', 'inversor', 'respaldo', 'bateria', 'lifepo4'],
  apagones: ['estacion', 'ecoflow', 'bluetti', 'inversor', 'respaldo', 'bateria', 'lifepo4'],
  respaldo: ['respaldo', 'estacion', 'inversor', 'bateria', 'ecoflow', 'bluetti', 'must'],
  bifasico: ['110', '220', 'fase', 'dividida', 'inversor', 'hibrido'],
  '220v': ['220v', '220', 'fase', 'dividida', '110/220v'],
  '110v': ['110v', '110', '110/220v'],
};

const STOP_WORDS = new Set([
  'de',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'para',
  'con',
  'sin',
  'en',
  'por',
  'del',
  'al',
  'y',
  'o',
  'que',
  'quiero',
  'busco',
  'necesito',
  'dame',
  'ver',
  'mostrar',
  'cual',
  'cuales',
  'tienes',
  'hay',
]);

const CURATED_VOCAB: ReadonlyArray<readonly [string, string]> = [
  ['jordan', 'Jordan'],
  ['new', 'New'],
  ['balance', 'Balance'],
  ['nike', 'Nike'],
  ['adidas', 'Adidas'],
  ['campus', 'Campus'],
  ['samba', 'Samba'],
  ['shox', 'Shox'],
  ['osiris', 'Osiris'],
  ['champion', 'Champion'],
  ['shein', 'SHEIN'],
  ['dior', 'Dior'],
  ['casio', 'Casio'],
  ['olevs', 'Olevs'],
  ['vestido', 'Vestido'],
  ['vestidos', 'Vestidos'],
  ['blusa', 'Blusa'],
  ['sudadera', 'Sudadera'],
  ['hoodie', 'Hoodie'],
  ['pulover', 'Pulóver'],
  ['cartera', 'Cartera'],
  ['reloj', 'Reloj'],
  ['audifonos', 'Audífonos'],
  ['pantalon', 'Pantalón'],
  ['tenis', 'Tenis'],
  ['zueco', 'Zueco'],
  ['zuecos', 'Zuecos'],
  ['sandalia', 'Sandalia'],
  ['sandalias', 'Sandalias'],
  ['accesorios', 'Accesorios'],
  ['solares', 'Equipos Solares'],
  ['panel', 'Panel Solar'],
  ['inversor', 'Inversor'],
  ['ecoflow', 'EcoFlow'],
  ['bluetti', 'Bluetti'],
  ['anker', 'Anker'],
  ['ampace', 'Ampace'],
  ['humsienk', 'Humsienk'],
  ['powmr', 'PowMr'],
  ['sumry', 'Sumry'],
  ['lifepo4', 'LiFePO4'],
  ['bateria', 'Batería'],
  ['motorina', 'Motorina'],
  ['bicimoto', 'Bicimoto'],
  ['triciclo', 'Triciclo'],
  ['topmaq', 'TopMaq'],
  ['yoazaky', 'Yoazaky'],
  ['unizuki', 'Unizuki'],
  ['vedca', 'Vedca'],
  ['bucatti', 'Bucatti'],
  ['lifan', 'Lifan'],
  ['kivitova', 'Kivitova'],
];

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
    const textSources = [p.title, p.fit_note || ''].join(' ');
    for (const rawWord of textSources.split(/\s+/)) {
      const nw = normalizeText(rawWord);
      if (nw && !/^\d+$/.test(nw) && !STOP_WORDS.has(nw)) {
        registerWord(nw, rawWord.replace(/[^\p{L}\p{N}-]/gu, ''));
      }
    }
  }

  for (const [key, pretty] of CURATED_VOCAB) {
    registerWord(key, pretty);
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
  if (!token || /^\d+(\.\d+)?$/.test(token) || /^(yol|vir|sol)-/.test(token)) {
    return { corrected: token, changed: false };
  }
  if (STOP_WORDS.has(token)) {
    return { corrected: token, changed: false };
  }

  // Exact known vocabulary or synonym key or color
  if (
    lexicon.vocabPrettyMap.has(token) ||
    SYNONYM_GROUPS[token] ||
    COLOR_NORMALIZATIONS[token]
  ) {
    return { corrected: token, changed: false };
  }

  // Direct alias map (neww -> new, yordan -> jordan, shien -> shein, ecofow -> ecoflow)
  if (TOKEN_ALIASES[token]) {
    return { corrected: TOKEN_ALIASES[token], changed: true };
  }

  // Collapsed repeats (nikee -> nike, neww -> new, campuss -> campus)
  const squeezed = collapseRepeats(token);
  if (
    squeezed !== token &&
    (lexicon.vocabPrettyMap.has(squeezed) ||
      SYNONYM_GROUPS[squeezed] ||
      TOKEN_ALIASES[squeezed])
  ) {
    return { corrected: TOKEN_ALIASES[squeezed] || squeezed, changed: true };
  }

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
  for (const [normBrand, prettyBrand] of lexicon.brandNormMap.entries()) {
    if (joined === normBrand) return prettyBrand;
  }
  return tokens
    .map((t) => lexicon.vocabPrettyMap.get(t) || t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ');
}

function parseNumericToken(rawNum: string, hasMil?: string): number {
  const clean = rawNum.replace(/,/g, '');
  const base = parseFloat(clean);
  if (!Number.isFinite(base)) return 0;
  return hasMil ? base * 1000 : base;
}

function expandSlangAndUnits(normalized: string): string {
  return normalized
    .replace(/\bnb\b/g, 'new balance')
    .replace(/\baf1\b|\bairforce\b/g, 'air force 1')
    .replace(/\baj4\b|\bj4\b/g, 'jordan 4')
    .replace(/\baj1\b|\bj1\b/g, 'jordan 1')
    .replace(/\baj13\b|\bj13\b/g, 'jordan 13')
    .replace(/\beco\s+flow\b/g, 'ecoflow')
    .replace(/\bdelta(\d)\b/g, 'delta $1')
    .replace(/\briver(\d)\b/g, 'river $1')
    .replace(/\b(\d+(?:\.\d+)?)\s*(volts|voltios|volt|v)\b/g, '$1v')
    .replace(/\b(\d+(?:\.\d+)?)\s*(watts|watt|w)\b/g, '$1w')
    .replace(/\b(\d+(?:\.\d+)?)\s*(wh|watt horas|watts horas)\b/g, '$1wh')
    .replace(/\b(\d+(?:\.\d+)?)\s*(kw)\b/g, '$1kw')
    .replace(/\b(\d+(?:\.\d+)?)\s*(kwh)\b/g, '$1kwh')
    .replace(/\b(\d+(?:\.\d+)?)\s*(amperes|amp|ah)\b/g, '$1ah')
    .replace(/\b(\d+)\s*cc\b/g, '$1cc');
}

export function parseSmartQuery(
  rawQuery: string,
  lexicon: SearchLexicon
): ParsedSmartQuery {
  let working = expandSlangAndUnits(normalizeText(rawQuery));
  let minUsd: number | null = null;
  let maxUsd: number | null = null;
  let minCup: number | null = null;
  let maxCup: number | null = null;
  let sizeHint: string | null = null;
  let featuredOnlyHint = false;
  let sortIntent: SmartSortIntent = null;
  let priceIntentLabel: string | null = null;

  // Range: "entre 15 y 30", "500 a 1,500 usd", "entre 20mil y 35mil cup"
  const rangeMatch = working.match(
    /(?:entre\s+)?\$?\s*(\d+(?:[.,]\d+)?)\s*(mil|k)?\s*(?:y|a|-)\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(mil|k)?\s*(usd|dolares|cup|pesos|\$)?/
  );
  if (rangeMatch) {
    const a = parseNumericToken(rangeMatch[1], rangeMatch[2]);
    const b = parseNumericToken(rangeMatch[3], rangeMatch[4]);
    const unit = rangeMatch[5];
    if (unit === 'cup' || unit === 'pesos' || b >= 5000 || Boolean(rangeMatch[4])) {
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

  // Upper bound: "menos de 20", "hasta 1,500", "bajo 25", "< 20", "menor a 30mil"
  const underMatch = working.match(
    /(?:menos de|menor a|menor de|hasta|bajo|debajo de|maximo|max|<)\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(mil|k)?\s*(usd|dolares|cup|pesos|\$)?/
  );
  if (underMatch) {
    const val = parseNumericToken(underMatch[1], underMatch[2]);
    const unit = underMatch[3];
    if (unit === 'cup' || unit === 'pesos' || val >= 5000 || Boolean(underMatch[2])) {
      maxCup = val;
      priceIntentLabel = `Hasta ${val.toLocaleString('es-CU')} CUP`;
    } else {
      maxUsd = val;
      priceIntentLabel = `Hasta $${val} USD`;
    }
    working = working.replace(underMatch[0], ' ');
  }

  // Lower bound: "mas de 30", "+30", "desde 800 usd", "> 30"
  const overMatch = working.match(
    /(?:mas de|mayor a|mayor de|desde|minimo|min|\+|>)\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(mil|k)?\s*(usd|dolares|cup|pesos|\$)?/
  );
  if (overMatch) {
    const val = parseNumericToken(overMatch[1], overMatch[2]);
    const unit = overMatch[3];
    if (unit === 'cup' || unit === 'pesos' || val >= 5000 || Boolean(overMatch[2])) {
      minCup = val;
      priceIntentLabel = `Más de ${val.toLocaleString('es-CU')} CUP`;
    } else {
      minUsd = val;
      priceIntentLabel = `+$${val} USD`;
    }
    working = working.replace(overMatch[0], ' ');
  }

  // Explicit size phrase: "talla 38", "talla m", "numero 42"
  const sizeMatch = working.match(/\b(?:talla|numero|num)\s+([a-z0-9.]+)\b/);
  if (sizeMatch) {
    sizeHint = sizeMatch[1].toUpperCase();
    working = working.replace(sizeMatch[0], ' ');
  }

  // Detect budget / sorting intent words before cleaning them
  const cheapRegex =
    /\b(barato|baratos|barata|baratas|economico|economicos|economica|economicas|oferta|ofertas)\b/;
  const hasCheapWord = cheapRegex.test(working);
  if (hasCheapWord) {
    working = working.replace(new RegExp(cheapRegex.source, 'g'), ' ');
  }

  const topRegex = /\b(destacados|favoritos top|mas pedido|mas pedidos|mas vendido|mas vendidos|lo mejor|mejores|populares)\b/;
  if (topRegex.test(working)) {
    featuredOnlyHint = true;
    working = working.replace(new RegExp(topRegex.source, 'g'), ' ');
  }

  const rawTokens = normalizeText(working)
    .replace(/[<>$]+/g, ' ')
    .split(' ')
    .filter((t) => t && !STOP_WORDS.has(t));

  // If user typed "barato" ALONE -> cap ≤ $15 USD; if paired with keywords ("motorina barata", "ecoflow barato"), sort cheapest first!
  if (hasCheapWord) {
    sortIntent = 'price_asc';
    if (rawTokens.length === 0 && maxUsd === null && maxCup === null) {
      maxUsd = 15;
      priceIntentLabel = 'Económicos (≤ $15 USD)';
    } else if (!priceIntentLabel) {
      priceIntentLabel = 'Menor precio primero';
    }
  }

  const correctedTokens: string[] = [];
  let anyChanged = false;
  for (const tok of rawTokens) {
    const res = correctSingleToken(tok, lexicon);
    correctedTokens.push(res.corrected);
    if (res.changed) anyChanged = true;
  }

  // Detect brand
  const joinedCorrected = correctedTokens.join(' ');
  let detectedBrand: string | null = null;
  for (const [normBrand, prettyBrand] of lexicon.brandNormMap.entries()) {
    if (
      joinedCorrected === normBrand ||
      correctedTokens.includes(normBrand) ||
      (normBrand.includes(' ') && joinedCorrected.includes(normBrand))
    ) {
      detectedBrand = prettyBrand;
      break;
    }
  }

  // Detect department hints for stronger relevance & UI badges
  const departmentHints: Department[] = [];
  if (
    /\b(tenis|zapatillas|zapatos|calzado|zueco|zuecos|sandalia|sandalias|chancleta|chancletas|chancla|chanclas|bota|botas)\b/.test(
      joinedCorrected
    )
  ) {
    departmentHints.push('calzado');
  }
  if (/\b(hombre|caballero|chico|bermuda|pulover|hoodie|sudadera|enguatada)\b/.test(joinedCorrected)) {
    departmentHints.push('hombre');
  }
  if (
    /\b(mujer|dama|chica|vestido|vestidos|blusa|corse|corset|bustier|falda|saya|leggings|shein)\b/.test(
      joinedCorrected
    )
  ) {
    departmentHints.push('moda_shein');
  }
  if (/\b(accesorios|cartera|bolso|reloj|relojes|audifonos|casio|olevs|mochila)\b/.test(joinedCorrected)) {
    departmentHints.push('accesorios');
  }
  if (
    /\b(moto|motos|motorina|motorinas|motico|pasola|bicimoto|bicimotos|bici|bicicleta|triciclo|triciclos|virginia|motor|motoneta|topmaq|yoazaky|vedca|bucatti|lifan|kivitova|250cc|150cc)\b/.test(
      joinedCorrected
    )
  ) {
    departmentHints.push('movilidad');
  }
  if (
    /\b(solar|solares|panel|paneles|placa|placas|inversor|inversores|ecoflow|bluetti|anker|ampace|oupes|aferry|humsienk|ecoworthy|lifepo4|estacion|estaciones|planta|plantas|apagon|apagones|respaldo|mppt|powmr|sumry|must|delta|apex|river|kwh|bifasico)\b/.test(
      joinedCorrected
    )
  ) {
    departmentHints.push('solares');
  }

  const intentBadges: string[] = [];
  if (detectedBrand) intentBadges.push(`Marca: ${detectedBrand}`);
  if (priceIntentLabel) intentBadges.push(priceIntentLabel);
  if (sizeHint) intentBadges.push(`Talla ${sizeHint}`);
  if (featuredOnlyHint) intentBadges.push('Solo TOP');
  if (departmentHints.length === 1) {
    const deptLabel: Record<Department, string> = {
      calzado: 'Calzado & Tenis',
      moda_shein: 'Moda Shein',
      hombre: 'Moda Hombre',
      accesorios: 'Accesorios',
      movilidad: 'Motos & Virginia',
      solares: 'Equipos Solares',
    };
    intentBadges.push(deptLabel[departmentHints[0]]);
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
    detectedBrand,
    minUsd,
    maxUsd,
    minCup,
    maxCup,
    sizeHint,
    featuredOnlyHint,
    sortIntent,
    priceIntentLabel,
    intentBadges,
  };
}

function buildProductHaystack(
  product: Product,
  categoryName: string,
  availableSizes: string[]
): { hay: string; skuNorm: string; titleNorm: string; brandNorm: string; catNorm: string } {
  const deptText =
    product.department === 'calzado'
      ? product.category_id === 'zuecos-sandalias'
        ? 'calzado zueco zuecos sandalia sandalias shein boston mujer'
        : 'calzado tenis zapatos sneakers'
      : product.department === 'hombre'
        ? 'moda hombre caballero ropa'
        : product.department === 'moda_shein'
          ? 'moda shein mujer dama ropa'
          : product.department === 'movilidad'
            ? 'motos motorinas bicimotos triciclos baterias motores todo virginia movilidad'
            : product.department === 'solares'
              ? 'equipos solares paneles inversores baterias lifepo4 estaciones energia ecoflow bluetti mppt respaldo'
              : 'accesorios carteras relojes audifonos';

  const rawJoined = `${product.sku} ${product.title} ${product.brand} ${categoryName} ${deptText} ${product.quality} ${product.fit_note || ''} ${availableSizes.join(' ')}`;
  // Add compact forms ("72 v" -> "72v", "1024 wh" -> "1024wh", "110/220v" -> "110v 220v")
  const compactSpecs = normalizeText(rawJoined)
    .replace(/\b(\d+(?:\.\d+)?)\s*(v|volt|volts|w|watt|watts|wh|kw|kwh|ah|amp|cc|km)\b/g, '$1$2')
    .replace(/110\s*\/?\s*220v?/g, '110v 220v 110 220');

  return {
    hay: `${normalizeText(rawJoined)} ${compactSpecs}`,
    skuNorm: normalizeText(product.sku),
    titleNorm: normalizeText(product.title),
    brandNorm: normalizeText(product.brand),
    catNorm: normalizeText(categoryName),
  };
}

function tokenMatchesHaystack(token: string, hay: string, dept: Department): boolean {
  const canonical = COLOR_NORMALIZATIONS[token] || token;
  if (hay.includes(token) || (canonical !== token && hay.includes(canonical))) {
    return true;
  }

  // Try stripping Spanish trailing plural -s/-es for words >= 4 chars
  if (token.length >= 4 && token.endsWith('s') && hay.includes(token.slice(0, -1))) {
    return true;
  }
  if (token.length >= 5 && token.endsWith('es') && hay.includes(token.slice(0, -2))) {
    return true;
  }

  const syns = SYNONYM_GROUPS[token] || SYNONYM_GROUPS[canonical];
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
    if ((token === 'mujer' || token === 'dama' || token === 'chica') && dept === 'moda_shein') {
      return true;
    }
    if (token === 'accesorios' && dept === 'accesorios') {
      return true;
    }
    if (
      (token === 'moto' ||
        token === 'motos' ||
        token === 'movilidad' ||
        token === 'virginia' ||
        token === 'triciclo' ||
        token === 'motorina' ||
        token === 'motico') &&
      dept === 'movilidad'
    ) {
      return true;
    }
    if (
      (token === 'solar' ||
        token === 'solares' ||
        token === 'panel' ||
        token === 'paneles' ||
        token === 'placa' ||
        token === 'placas' ||
        token === 'inversor' ||
        token === 'inversores' ||
        token === 'estacion' ||
        token === 'estaciones' ||
        token === 'planta' ||
        token === 'plantas' ||
        token === 'apagon' ||
        token === 'apagones' ||
        token === 'ecoflow' ||
        token === 'bluetti' ||
        token === 'lifepo4') &&
      dept === 'solares'
    ) {
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

  const { hay, skuNorm, titleNorm, brandNorm, catNorm } = buildProductHaystack(
    product,
    categoryName,
    availableSizes
  );

  if (!tokens.every((t) => tokenMatchesHaystack(t, hay, product.department))) {
    return { matches: false, score: 0 };
  }

  let score = 0;
  if (skuNorm === parsed.correctedQuery) score += 120;
  if (brandNorm === parsed.correctedQuery) score += 70;
  if (titleNorm.includes(parsed.correctedQuery)) score += 55;
  if (catNorm.includes(parsed.correctedQuery)) score += 32;
  for (const t of tokens) {
    const c = COLOR_NORMALIZATIONS[t] || t;
    if (titleNorm.includes(t) || titleNorm.includes(c)) score += 18;
    if (brandNorm.includes(t)) score += 14;
    if (catNorm.includes(t)) score += 9;
    if (hay.includes(t)) score += 4;
  }
  if (parsed.departmentHints.includes(product.department)) score += 6;
  if (product.featured) score += 5;

  return { matches: true, score };
}

/**
 * Fallback inteligente cuando una búsqueda multi-palabra exacta arroja 0 resultados:
 * encuentra coincidencias parciales fuertes (marca/modelo/categoría) sin violar filtros numéricos de precio.
 */
export function matchRelaxedSmartProduct(
  product: Product,
  parsed: ParsedSmartQuery,
  categoryName: string,
  usdToCupRate: number,
  availableSizes: string[]
): { matches: boolean; score: number } {
  if (parsed.correctedTokens.length < 2) return { matches: false, score: 0 };
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

  const { hay, titleNorm, brandNorm } = buildProductHaystack(
    product,
    categoryName,
    availableSizes
  );
  let matchedCount = 0;
  let score = 0;
  for (const t of parsed.correctedTokens) {
    if (tokenMatchesHaystack(t, hay, product.department)) {
      matchedCount += 1;
      if (brandNorm.includes(t)) score += 20;
      if (titleNorm.includes(t)) score += 15;
      score += 5;
    }
  }
  // Require majority or strong brand/model hit (>= 2 tokens if query has 3+, or >= 1 high-value hit for 2 tokens)
  const minNeeded = parsed.correctedTokens.length >= 3 ? 2 : 1;
  if (matchedCount < minNeeded || score < 15) {
    return { matches: false, score: 0 };
  }
  if (product.featured) score += 3;
  return { matches: true, score };
}

export interface SearchSuggestionsResult {
  didYouMean: string | null;
  priceIntentLabel: string | null;
  intentBadges: string[];
  quickChips: string[];
  topProducts: Product[];
  totalMatchCount: number;
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
      intentBadges: [],
      quickChips: [
        'EcoFlow',
        'New Balance',
        'Motorinas Litio',
        'Jordan 4',
        'Vestidos',
        'Paneles Solares',
        'Hasta $25',
        'Zuecos Boston',
      ],
      topProducts: [],
      totalMatchCount: active.length,
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

  if (scored.length === 0 && parsed.correctedTokens.length >= 2) {
    for (const p of active) {
      const catName = lexicon.categoryMap.get(p.category_id)?.name || '';
      const soldSet = new Set(p.sold_out_sizes || []);
      const availSizes = p.sizes.filter((s) => s && !soldSet.has(s));
      const res = matchRelaxedSmartProduct(p, parsed, catName, usdToCupRate, availSizes);
      if (res.matches) {
        scored.push({ product: p, score: res.score });
      }
    }
  }

  if (parsed.sortIntent === 'price_asc') {
    scored.sort((a, b) => {
      const pa = priceInCup(a.product.price, a.product.currency, usdToCupRate) ?? Infinity;
      const pb = priceInCup(b.product.price, b.product.currency, usdToCupRate) ?? Infinity;
      return pa - pb || b.score - a.score;
    });
  } else {
    scored.sort((a, b) => b.score - a.score);
  }

  const chipSet = new Set<string>();
  for (const b of lexicon.brands) {
    if (
      normalizeText(b).includes(parsed.correctedQuery) ||
      parsed.correctedTokens.some((t) => normalizeText(b).includes(t))
    ) {
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
    intentBadges: parsed.intentBadges,
    quickChips: Array.from(chipSet).slice(0, 6),
    topProducts: scored.slice(0, 5).map((x) => x.product),
    totalMatchCount: scored.length,
  };
}

export function splitHighlightParts(
  text: string,
  tokens: string[]
): Array<{ text: string; hit: boolean }> {
  const cleanTokens = tokens
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (cleanTokens.length === 0) return [{ text, hit: false }];

  const regex = new RegExp(`(${cleanTokens.join('|')})`, 'gi');
  const normRegex = new RegExp(`^(${cleanTokens.join('|')})$`, 'i');
  const rawParts = text.split(regex).filter(Boolean);
  return rawParts.map((part) => ({
    text: part,
    hit: normRegex.test(normalizeText(part)) || normRegex.test(part),
  }));
}

const SEARCH_HISTORY_KEY = 'yole_shop_search_history_v1';

export function readSearchHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export function pushSearchHistory(query: string): string[] {
  const clean = query.trim();
  if (clean.length < 2) return readSearchHistory();
  const next = [
    clean,
    ...readSearchHistory().filter((q) => q.toLowerCase() !== clean.toLowerCase()),
  ].slice(0, 5);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}

export function removeSearchHistoryItem(query: string): string[] {
  const next = readSearchHistory().filter((q) => q.toLowerCase() !== query.trim().toLowerCase());
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}
