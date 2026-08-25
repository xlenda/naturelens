const { cleanWikiSections, richerDossier } = require('./speciesDossier');

const VALID_MEASUREMENT_IDS = new Set([
  'clutchSize',
  'incubationPeriod',
  'lifeExpectancy',
  'longestLifespan',
]);
const VALID_UNITS = new Set(['count', 'hour', 'day', 'week', 'month', 'year']);
const REPRODUCTION_IDS = new Set(['clutchSize', 'incubationPeriod']);
const LIFE_CYCLE_IDS = new Set(['lifeExpectancy', 'longestLifespan']);
const IUCN_CODES = new Set(['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE']);
const MAX_FACTS = 24;
const MAX_MEASUREMENTS = 12;
const WIKIPEDIA_HOSTS = new Set([
  'en.wikipedia.org', 'pt.wikipedia.org', 'es.wikipedia.org', 'de.wikipedia.org',
  'fr.wikipedia.org', 'it.wikipedia.org', 'nl.wikipedia.org', 'pl.wikipedia.org',
  'sv.wikipedia.org', 'da.wikipedia.org', 'cs.wikipedia.org', 'tr.wikipedia.org',
  'ko.wikipedia.org', 'zh.wikipedia.org', 'hi.wikipedia.org', 'ar.wikipedia.org',
]);
const memoryCache = new Map();
const inflight = new Map();
const retryAfterNotFound = new Set();

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanScientific(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().normalize('NFC');
  return /^\p{Lu}[\p{L}-]{1,63} \p{Ll}[\p{L}-]{1,63}$/u.test(clean)
    ? clean
    : null;
}

function cleanLanguage(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase().replace(/_/g, '-');
  return /^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(clean) ? clean : null;
}

function cleanSource(value) {
  if (!isPlainObject(value)) return null;
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  if (
    value.id === 'gbif' &&
    /^https:\/\/www\.gbif\.org\/species\/[1-9]\d*$/.test(url) &&
    value.license === 'CC-BY-4.0'
  ) {
    return { id: 'gbif', url, license: value.license };
  }
  if (
    value.id === 'wikidata' &&
    /^https:\/\/www\.wikidata\.org\/wiki\/Q[1-9]\d*$/.test(url) &&
    value.license === 'CC0-1.0'
  ) {
    return { id: 'wikidata', url, license: value.license };
  }
  if (value.id === 'wikipedia' && value.license === 'CC-BY-SA-4.0') {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol === 'https:' &&
        WIKIPEDIA_HOSTS.has(parsed.hostname) &&
        parsed.pathname.startsWith('/wiki/') &&
        parsed.pathname.length > '/wiki/'.length &&
        !parsed.username &&
        !parsed.password &&
        !parsed.search &&
        !parsed.hash
      ) {
        return { id: 'wikipedia', url, license: value.license };
      }
    } catch (error) {
      return null;
    }
  }
  return null;
}

function cleanFacts(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const fact of value.slice(0, MAX_FACTS)) {
    if (!isPlainObject(fact)) continue;
    const id = typeof fact.id === 'string' && /^Q[1-9]\d*$/.test(fact.id) ? fact.id : null;
    const label = typeof fact.label === 'string' ? fact.label.trim() : '';
    if (!id || !label || label.length > 160 || /[\u0000-\u001f\u007f]/.test(label)) continue;
    if (!byId.has(id)) byId.set(id, { id, label });
  }
  return [...byId.values()];
}

function cleanMeasurements(value, allowedIds) {
  if (!Array.isArray(value)) return [];
  const byValue = new Map();
  for (const item of value.slice(0, MAX_MEASUREMENTS)) {
    if (!isPlainObject(item) || !allowedIds.has(item.id) || !VALID_MEASUREMENT_IDS.has(item.id)) {
      continue;
    }
    const amount = item.amount;
    const unit = item.unit;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000 || !VALID_UNITS.has(unit)) {
      continue;
    }
    if (item.id === 'clutchSize' && unit !== 'count') continue;
    if (item.id !== 'clutchSize' && unit === 'count') continue;
    const key = `${item.id}:${amount}:${unit}`;
    if (!byValue.has(key)) byValue.set(key, { id: item.id, amount, unit });
  }
  return [...byValue.values()];
}

function normaliseBirdDossier(value, expectedScientific) {
  if (!isPlainObject(value)) return null;
  const expected = cleanScientific(expectedScientific);
  const scientific = cleanScientific(value.scientific);
  if (!expected || scientific !== expected) return null;

  const sources = Array.isArray(value.sources)
    ? value.sources.map(cleanSource).filter(Boolean)
    : [];
  const sourceIds = new Set(sources.map((source) => source.id));
  // GBIF e a prova mundial de que o binomio aceito pertence a Aves. Sem ela,
  // nenhum fato do Wikidata pode ser associado ao resultado da foto.
  if (!sourceIds.has('gbif')) return null;

  const hasWikidata = sourceIds.has('wikidata');
  const diet = hasWikidata ? cleanFacts(value.diet) : [];
  const habitat = hasWikidata ? cleanFacts(value.habitat) : [];
  const reproduction = hasWikidata
    ? cleanMeasurements(value.reproduction, REPRODUCTION_IDS)
    : [];
  const lifeCycle = hasWikidata
    ? cleanMeasurements(value.lifeCycle, LIFE_CYCLE_IDS)
    : [];
  const code = hasWikidata && isPlainObject(value.conservation)
    ? value.conservation.code
    : null;
  const conservation = typeof code === 'string' && IUCN_CODES.has(code)
    ? { code }
    : null;
  const wikiSections = sourceIds.has('wikipedia')
    ? cleanWikiSections(value.wikiSections)
    : [];
  if (
    diet.length === 0 &&
    habitat.length === 0 &&
    reproduction.length === 0 &&
    lifeCycle.length === 0 &&
    !conservation &&
    wikiSections.length === 0
  ) {
    return null;
  }

  return {
    scientific,
    diet,
    habitat,
    reproduction,
    lifeCycle,
    conservation,
    wikiSections,
    sources,
    partial: value.partial === true,
  };
}

function birdDossierUrl(apiBase, scientific, language, refreshToken = null) {
  const base = typeof apiBase === 'string' ? apiBase.replace(/\/$/, '') : '';
  const refresh = Number.isInteger(refreshToken) && refreshToken >= 0
    ? `&refresh=${refreshToken}`
    : '';
  return `${base}/api/species-dossier?category=bird` +
    `&scientificName=${encodeURIComponent(scientific)}` +
    `&language=${encodeURIComponent(language)}` +
    '&wiki=1' + refresh;
}

async function getBirdSpeciesDossier({ apiBase = '', scientific, language, fetchImpl } = {}) {
  const cleanName = cleanScientific(scientific);
  const cleanLocale = cleanLanguage(language);
  const request = typeof fetchImpl === 'function' ? fetchImpl : global.fetch;
  if (!cleanName || !cleanLocale || typeof request !== 'function') return null;

  const key = `${cleanName}:${cleanLocale}`;
  if (memoryCache.has(key)) return memoryCache.get(key);
  if (inflight.has(key)) return inflight.get(key);
  const refreshToken = retryAfterNotFound.has(key)
    ? Math.floor(Date.now() / 15000)
    : null;

  const pending = (async () => {
    try {
      const load = async (refreshToken = null) => {
        const response = await request(
          birdDossierUrl(apiBase, cleanName, cleanLocale, refreshToken),
          { headers: { Accept: 'application/json' } }
        );
        if (!response?.ok) return { response, dossier: null, partial: false };
        const payload = await response.json();
        return {
          response,
          dossier: normaliseBirdDossier(payload, cleanName),
          partial: isPlainObject(payload) && payload.partial === true,
        };
      };
      const first = await load(refreshToken);
      const response = first.response;
      if (response?.status === 404) {
        // The dossier backend can become complete after this request (or a
        // transient deployment may briefly answer 404). Absence is therefore
        // not durable; a later opening gets a fresh chance, like partial data.
        retryAfterNotFound.add(key);
        return null;
      }
      if (!response?.ok) return null;
      let dossier = first.dossier;
      if (first.partial) {
        const second = await load(Math.floor(Date.now() / 15000));
        dossier = normaliseBirdDossier(richerDossier(dossier, second.dossier), cleanName);
      }
      if (dossier && !dossier.partial) {
        memoryCache.set(key, dossier);
        retryAfterNotFound.delete(key);
      }
      return dossier;
    } catch (error) {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, pending);
  return pending;
}

function clearBirdSpeciesDossierCache() {
  memoryCache.clear();
  inflight.clear();
  retryAfterNotFound.clear();
}

module.exports = {
  birdDossierUrl,
  cleanMeasurements,
  clearBirdSpeciesDossierCache,
  getBirdSpeciesDossier,
  normaliseBirdDossier,
};
