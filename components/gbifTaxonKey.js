import AsyncStorage from '@react-native-async-storage/async-storage';

// Resolve de nome cientifico -> taxonKey do GBIF, com cache versionado.
// Extraido de DistributionMap.js para a paridade 120% (video do concorrente,
// 20/08): SeasonChart precisa exatamente da MESMA chave, e duas copias da
// mesma logica na mesma tela significavam duas coisas ruins - dois formatos de
// cache que podem divergir com o tempo e DUAS chamadas /species/match
// simultaneas por especie (mapa e grafico montam juntos).
//
// A versao 2 invalida o cache antigo de proposito: a primeira implementacao
// guardava qualquer usageKey devolvido por /species/match, inclusive genero,
// fuzzy match ou homonimo. Reusar esse valor para sempre misturaria ocorrencias
// de outras especies no mapa, no grafico e na galeria.
//
// HONESTIDADE: erro de rede / GBIF fora do ar / nome sem match devolvem null
// e NAO gravam cache - quem chama simplesmente nao renderiza o bloco, e a
// proxima abertura tenta de novo. Nunca um valor inventado para "ter o que
// desenhar".
const CACHE_PREFIX = '@naturelens_gbif_v2_';
const RESOLVER_VERSION = 2;
const EXACT_RANKS = new Set(['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM']);

// O GBIF pede identificacao de quem consome a API.
export const GBIF_UA = 'NatureLens (naturelensapp.cloud)';

// Promessas em voo por chave: o mapa e o grafico de estacao montam no mesmo
// frame e pediriam o mesmo match duas vezes.
const inflight = new Map();

function canonicalBinomial(value) {
  if (typeof value !== 'string') return '';
  const words = value.trim().toLowerCase().replace(/\s+/g, ' ').split(' ');
  if (words.length < 2) return '';
  return words[1] === 'x' && words[2]
    ? words.slice(0, 3).join(' ')
    : words.slice(0, 2).join(' ');
}

function positiveKey(value) {
  const key = String(value ?? '').trim();
  return /^[1-9]\d*$/.test(key) ? key : null;
}

function recordName(record) {
  return record?.canonicalName || record?.scientificName || record?.species || null;
}

// O GBIF e backbone taxonomico, nao um corretor de texto. Apenas uma resposta
// no nivel de especie, com nome canonico compativel, pode enriquecer o resultado
// da foto. Genero, familia, fuzzy match e homonimo falham fechados.
export function validateGbifTaxon(scientific, record, { expectedKey = null, fromMatch = false } = {}) {
  const inputName = canonicalBinomial(scientific);
  const matchedName = canonicalBinomial(recordName(record));
  const key = positiveKey(record?.usageKey ?? record?.key);
  const rank = String(record?.rank || '').toUpperCase();
  if (!inputName || !matchedName || inputName !== matchedName || !key || !EXACT_RANKS.has(rank)) {
    return null;
  }
  if (expectedKey && key !== positiveKey(expectedKey)) return null;
  if (fromMatch) {
    if (String(record?.matchType || '').toUpperCase() !== 'EXACT') return null;
    if (!Number.isFinite(record?.confidence) || record.confidence < 90) return null;
  }
  return {
    key,
    canonicalName: recordName(record),
    rank,
    resolverVersion: RESOLVER_VERSION,
  };
}

function readCached(value, scientific) {
  // Legacy builds persisted `none` forever after any non-exact response. Treat
  // that sentinel as stale so a later GBIF correction or recovered resolver is
  // tried again instead of hiding maps and seasonality permanently.
  if (value === 'none') return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.resolverVersion !== RESOLVER_VERSION) return undefined;
    return validateGbifTaxon(scientific, {
      key: parsed.key,
      canonicalName: parsed.canonicalName,
      rank: parsed.rank,
    })?.key || null;
  } catch (e) {
    return undefined;
  }
}

export async function getTaxonKey(scientific, providedKey) {
  const canonical = canonicalBinomial(scientific);
  if (!canonical) return null;
  const direct = positiveKey(providedKey);
  const cacheKey = CACHE_PREFIX + canonical + (direct ? `:${direct}` : ':match');

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached !== null) {
      const resolved = readCached(cached, scientific);
      if (resolved !== undefined) return resolved;
    }
  } catch (e) {
    // storage indisponivel: segue para a rede
  }

  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const pending = (async () => {
    try {
      const url = direct
        ? `https://api.gbif.org/v1/species/${direct}`
        : 'https://api.gbif.org/v1/species/match?name=' + encodeURIComponent(scientific);
      const r = await fetch(url, { headers: { 'User-Agent': GBIF_UA } });
      if (!r.ok) return null;
      const d = await r.json();
      const resolved = validateGbifTaxon(scientific, d, {
        expectedKey: direct,
        fromMatch: !direct,
      });
      // Only verified positive identities are durable. A miss may be transient
      // (backbone update, temporary incomplete response), so the next opening
      // must be free to ask GBIF again.
      if (resolved) {
        await AsyncStorage.setItem(cacheKey, JSON.stringify(resolved)).catch(() => {});
      }
      return resolved?.key || null;
    } catch (e) {
      // offline / GBIF fora do ar: sem cache, tenta de novo na proxima vez
      return null;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, pending);
  return pending;
}
