const VALID_CATEGORIES = new Set([
  'plant', 'tree', 'crop', 'mushroom', 'insect', 'fish', 'bird', 'sound',
]);
const VALID_ENVIRONMENTS = Object.freeze(['marine', 'brackish', 'freshwater']);
const REPRODUCTION_IDS = new Set(['clutchSize', 'incubationPeriod', 'gestationPeriod']);
const LIFE_CYCLE_IDS = new Set(['lifeExpectancy', 'longestLifespan']);
const VALID_MEASUREMENT_IDS = new Set([...REPRODUCTION_IDS, ...LIFE_CYCLE_IDS]);
const VALID_UNITS = new Set(['count', 'hour', 'day', 'week', 'month', 'year']);
const IUCN_CODES = new Set(['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE']);
const INTERACTION_RELATIONS = new Set([
  'eats',
  'preysOn',
  'pollinates',
  'visitsFlowersOf',
  'hasHost',
  'parasiteOf',
  'parasitoidOf',
  'vectorOf',
]);
const LIFE_STAGE_IDS = new Set(['egg', 'larva', 'nymph', 'pupa', 'adult']);
const WIKI_SECTION_KEYS = new Set([
  'phenology', 'propagation', 'cultivation', 'uses', 'habitat', 'feeding',
  'reproduction', 'lifeCycle', 'behavior', 'ecology', 'migration',
  'vocalization', 'acousticPattern', 'frequencyTiming', 'substrate', 'conservation',
]);
const WIKIPEDIA_HOSTS = new Set([
  'en.wikipedia.org', 'pt.wikipedia.org', 'es.wikipedia.org', 'de.wikipedia.org',
  'fr.wikipedia.org', 'it.wikipedia.org', 'nl.wikipedia.org', 'pl.wikipedia.org',
  'sv.wikipedia.org', 'da.wikipedia.org', 'cs.wikipedia.org', 'tr.wikipedia.org',
  'ko.wikipedia.org', 'zh.wikipedia.org', 'hi.wikipedia.org', 'ar.wikipedia.org',
]);
const MAX_FACTS = 24;
const MAX_MEASUREMENTS = 18;
const MAX_INTERACTIONS = 18;
const NOT_FOUND_TTL_MS = 15000;
const NEGATIVE_CACHE = Symbol('negativeSpeciesDossier');
const memoryCache = new Map();
const inflight = new Map();
const retryAfterNotFound = new Set();

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

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanFactList(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const item of value.slice(0, MAX_FACTS)) {
    if (!isPlainObject(item)) continue;
    const id = typeof item.id === 'string' && /^Q[1-9]\d*$/.test(item.id) ? item.id : null;
    const label = typeof item.label === 'string' ? item.label.trim() : '';
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
    if (item.id === 'incubationPeriod' && !['hour', 'day', 'week', 'month'].includes(unit)) continue;
    if (
      ['gestationPeriod', 'lifeExpectancy', 'longestLifespan'].includes(item.id) &&
      !['day', 'week', 'month', 'year'].includes(unit)
    ) {
      continue;
    }
    const key = `${item.id}:${amount}:${unit}`;
    if (!byValue.has(key)) byValue.set(key, { id: item.id, amount, unit });
  }
  return [...byValue.values()];
}

function cleanSource(value, expectedScientific) {
  if (!isPlainObject(value)) return null;
  const id = value.id;
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  const license = typeof value.license === 'string' ? value.license.trim() : '';

  if (
    id === 'worms' &&
    /^https:\/\/www\.marinespecies\.org\/aphia\.php\?p=taxdetails&id=[1-9]\d*$/.test(url) &&
    license === 'CC-BY-4.0'
  ) {
    return { id, url, license };
  }
  if (
    id === 'wikidata' &&
    /^https:\/\/www\.wikidata\.org\/wiki\/Q[1-9]\d*$/.test(url) &&
    license === 'CC0-1.0'
  ) {
    return { id, url, license };
  }
  if (
    id === 'gbif' &&
    /^https:\/\/www\.gbif\.org\/species\/[1-9]\d*$/.test(url) &&
    license === 'CC-BY-4.0'
  ) {
    return { id, url, license };
  }
  if (id === 'wikipedia' && license === 'CC-BY-SA-4.0') {
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
        return { id, url, license };
      }
    } catch (error) {
      return null;
    }
  }
  if (id === 'globi' && license === 'CC-BY-4.0') {
    try {
      const parsed = new URL(url);
      const queryKeys = [];
      parsed.searchParams.forEach((unused, key) => queryKeys.push(key));
      if (
        parsed.protocol === 'https:' &&
        parsed.hostname === 'globalbioticinteractions.org' &&
        parsed.pathname === '/' &&
        queryKeys.length === 1 &&
        queryKeys[0] === 'sourceTaxon' &&
        parsed.searchParams.get('sourceTaxon') === expectedScientific
      ) {
        return { id, url, license };
      }
    } catch (error) {
      return null;
    }
  }
  return null;
}

function cleanInteractionList(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  const targetId = '(?:GBIF|EOL|NCBI|ITIS|IRMNG):[1-9]\\d*|WD:Q[1-9]\\d*|COL:[A-Z0-9]{2,24}';
  for (const item of value.slice(0, MAX_INTERACTIONS)) {
    if (!isPlainObject(item) || !INTERACTION_RELATIONS.has(item.relation)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    const name = typeof item.name === 'string'
      ? item.name.trim().replace(/\s+/g, ' ').normalize('NFC')
      : '';
    const exactTaxon = /^\p{Lu}[\p{L}\p{M}.'\u2019-]{1,63} (?:(?:\u00d7|x)\s*)?\p{Ll}[\p{L}\p{M}.'\u2019-]{1,63}(?: (?:subsp\.|ssp\.|var\.|f\.) \p{Ll}[\p{L}\p{M}.'\u2019-]{1,63})?$/u;
    if (
      !new RegExp(`^${item.relation}:(?:${targetId})$`).test(id) ||
      !exactTaxon.test(name) ||
      name.length > 160 ||
      /[\u0000-\u001f\u007f]/.test(name)
    ) {
      continue;
    }
    if (!byId.has(id)) byId.set(id, { id, name, relation: item.relation });
  }
  return [...byId.values()];
}

function cleanLifeStages(value) {
  if (!Array.isArray(value)) return [];
  const found = new Set(value.filter((stage) => LIFE_STAGE_IDS.has(stage)));
  return ['egg', 'larva', 'nymph', 'pupa', 'adult'].filter((stage) => found.has(stage));
}

function cleanWikiSections(value) {
  if (!Array.isArray(value)) return [];
  const byKey = new Map();
  for (const item of value.slice(0, WIKI_SECTION_KEYS.size)) {
    if (!isPlainObject(item) || !WIKI_SECTION_KEYS.has(item.key) || byKey.has(item.key)) continue;
    const heading = typeof item.heading === 'string'
      ? item.heading.trim().replace(/\s+/g, ' ').normalize('NFC')
      : '';
    const text = typeof item.text === 'string'
      ? item.text.trim().replace(/\s+/g, ' ').normalize('NFC')
      : '';
    if (
      !heading || heading.length > 120 ||
      text.length < 24 || text.length > 1900 ||
      /[\u0000-\u001f\u007f]/.test(heading) ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
    ) {
      continue;
    }
    byKey.set(item.key, { key: item.key, heading, text });
  }
  return [...byKey.values()];
}

function cleanTaxonomyRank(value) {
  if (typeof value !== 'string') return null;
  const rank = value.trim().normalize('NFC');
  return rank && rank.length <= 100 && /^[\p{L}\p{M}.'\u2019 -]+$/u.test(rank)
    ? rank
    : null;
}

function cleanTaxonomy(value, expectedScientific, sourceIds) {
  if (!isPlainObject(value)) return null;
  const sourceId = value.sourceId;
  if (!['gbif', 'worms'].includes(sourceId) || !sourceIds.has(sourceId)) return null;
  if (cleanScientific(value.species) !== expectedScientific) return null;

  const taxonomy = { sourceId, species: expectedScientific };
  for (const key of ['kingdom', 'phylum', 'className', 'order', 'family', 'genus']) {
    const clean = cleanTaxonomyRank(value[key]);
    if (clean) taxonomy[key] = clean;
  }
  return taxonomy;
}

function normaliseSpeciesDossier(value, expectedScientific) {
  if (!isPlainObject(value)) return null;
  const expected = cleanScientific(expectedScientific);
  const scientific = cleanScientific(value.scientific);
  if (!expected || scientific !== expected) return null;

  const sources = Array.isArray(value.sources)
    ? value.sources.map((source) => cleanSource(source, expected)).filter(Boolean)
    : [];
  const sourceIds = new Set(sources.map((source) => source.id));
  const taxonomy = cleanTaxonomy(value.taxonomy, expected, sourceIds);

  let environment = null;
  if (sourceIds.has('worms') && isPlainObject(value.environment)) {
    const clean = {};
    for (const key of VALID_ENVIRONMENTS) {
      const item = value.environment[key];
      clean[key] = typeof item === 'boolean' ? item : null;
    }
    if (Object.values(clean).some((item) => item === true)) environment = clean;
  }

  // Fato e fonte viajam juntos. Uma resposta parcial nunca pode fazer dieta
  // parecer atribuida ao WoRMS nem ambiente parecer declarado pelo Wikidata.
  const diet = sourceIds.has('wikidata') ? cleanFactList(value.diet) : [];
  const habitat = sourceIds.has('wikidata') ? cleanFactList(value.habitat) : [];
  const reproduction = sourceIds.has('wikidata')
    ? cleanMeasurements(value.reproduction, REPRODUCTION_IDS)
    : [];
  const lifeCycle = sourceIds.has('wikidata')
    ? cleanMeasurements(value.lifeCycle, LIFE_CYCLE_IDS)
    : [];
  const code = sourceIds.has('wikidata') && isPlainObject(value.conservation)
    ? value.conservation.code
    : null;
  const conservation = typeof code === 'string' && IUCN_CODES.has(code)
    ? { code }
    : null;
  // Relacoes GloBI so sobrevivem quando o mesmo payload carrega a prova
  // taxonomica GBIF do invertebrado exato. Nome sozinho nunca atribui ecologia.
  const hasInteractionProof =
    (sourceIds.has('gbif') || sourceIds.has('wikidata')) && sourceIds.has('globi');
  const feeding = hasInteractionProof ? cleanInteractionList(value.feeding) : [];
  const plantAssociations = hasInteractionProof
    ? cleanInteractionList(value.plantAssociations)
    : [];
  const ecologicalRelations = hasInteractionProof
    ? cleanInteractionList(value.ecologicalRelations)
    : [];
  const documentedLifeStages = hasInteractionProof
    ? cleanLifeStages(value.documentedLifeStages)
    : [];
  const wikiSections = sourceIds.has('wikipedia')
    ? cleanWikiSections(value.wikiSections)
    : [];
  const hasEditorialContent =
    !!environment ||
    diet.length > 0 ||
    habitat.length > 0 ||
    reproduction.length > 0 ||
    lifeCycle.length > 0 ||
    !!conservation ||
    feeding.length > 0 ||
    plantAssociations.length > 0 ||
    ecologicalRelations.length > 0 ||
    documentedLifeStages.length > 0 ||
    wikiSections.length > 0;
  if (
    !hasEditorialContent &&
    (!taxonomy || value.partial !== true)
  ) {
    return null;
  }

  return {
    scientific,
    taxonomy,
    environment,
    diet,
    habitat,
    reproduction,
    lifeCycle,
    conservation,
    feeding,
    plantAssociations,
    ecologicalRelations,
    documentedLifeStages,
    wikiSections,
    sources,
    partial: value.partial === true,
  };
}

function dossierUrl(apiBase, { category, scientific, language, refreshToken = null }) {
  const base = typeof apiBase === 'string' ? apiBase.replace(/\/$/, '') : '';
  const refresh = Number.isInteger(refreshToken) && refreshToken >= 0
    ? `&refresh=${refreshToken}`
    : '';
  return `${base}/api/species-dossier?category=${encodeURIComponent(category)}` +
    `&scientificName=${encodeURIComponent(scientific)}` +
    `&language=${encodeURIComponent(language)}` +
    '&wiki=1' + refresh;
}

function nowFrom(nowImpl) {
  const value = typeof nowImpl === 'function' ? Number(nowImpl()) : Date.now();
  return Number.isFinite(value) && value >= 0 ? value : Date.now();
}

async function getSpeciesDossier({
  apiBase = '',
  category,
  scientific,
  language,
  fetchImpl,
  nowImpl,
} = {}) {
  const cleanCategory = typeof category === 'string' ? category.trim().toLowerCase() : null;
  const cleanName = cleanScientific(scientific);
  const cleanLocale = cleanLanguage(language);
  const request = typeof fetchImpl === 'function' ? fetchImpl : global.fetch;
  if (!VALID_CATEGORIES.has(cleanCategory) || !cleanName || !cleanLocale || typeof request !== 'function') {
    return null;
  }

  const key = `${cleanCategory}:${cleanName}:${cleanLocale}`;
  const cached = memoryCache.get(key);
  if (cached?.[NEGATIVE_CACHE]) {
    if (cached.expiresAt > nowFrom(nowImpl)) return null;
    memoryCache.delete(key);
  } else if (memoryCache.has(key)) {
    return cached;
  }
  if (inflight.has(key)) return inflight.get(key);

  const requestStartedAt = nowFrom(nowImpl);
  const refreshToken = retryAfterNotFound.has(key)
    ? Math.floor(requestStartedAt / NOT_FOUND_TTL_MS)
    : null;

  const pending = (async () => {
    try {
      const response = await request(dossierUrl(apiBase, {
        category: cleanCategory,
        scientific: cleanName,
        language: cleanLocale,
        refreshToken,
      }), { headers: { Accept: 'application/json' } });
      if (response?.status === 404) {
        // O 404 curto evita repeticao em uma mesma montagem, mas expira. O
        // refresh por janela tambem contorna um 404 antigo preso na CDN.
        memoryCache.set(key, {
          [NEGATIVE_CACHE]: true,
          expiresAt: nowFrom(nowImpl) + NOT_FOUND_TTL_MS,
        });
        retryAfterNotFound.add(key);
        return null;
      }
      if (!response?.ok) return null;
      const dossier = normaliseSpeciesDossier(await response.json(), cleanName);
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

function clearSpeciesDossierCache() {
  memoryCache.clear();
  inflight.clear();
  retryAfterNotFound.clear();
}

module.exports = {
  cleanFactList,
  cleanInteractionList,
  cleanLifeStages,
  cleanWikiSections,
  cleanMeasurements,
  cleanScientific,
  clearSpeciesDossierCache,
  dossierUrl,
  getSpeciesDossier,
  NOT_FOUND_TTL_MS,
  normaliseSpeciesDossier,
};
