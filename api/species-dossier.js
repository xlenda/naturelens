const {
  BIRD_SOURCE_UNAVAILABLE,
  BirdUpstreamError,
  loadBirdDossier,
  mapConservation,
  mapMeasurements,
  wikidataClaimsUrl,
} = require('./_lib/birdDossier');
const {
  gbifInvertebrateMatchUrl,
  gbifSource,
  globiSource,
  loadGlobiInteractions,
  selectExactGbifInvertebrate,
} = require('./_lib/insectDossier');
const {
  loadGenericWikiDossier,
  loadWikipediaSections,
} = require('./_lib/wikiDossier');

const SUPPORTED_LANGUAGES = new Set([
  'en',
  'pt',
  'es',
  'de',
  'fr',
  'it',
  'nl',
  'pl',
  'sv',
  'da',
  'cs',
  'tr',
  'ko',
  'zh',
  'zh-hant',
  'hi',
  'ar',
]);

const VALID_CATEGORIES = new Set([
  'plant', 'tree', 'crop', 'mushroom', 'insect', 'fish', 'bird', 'sound',
]);
const GENERIC_WIKI_CATEGORIES = new Set(['plant', 'tree', 'crop', 'mushroom', 'sound']);
const FISH_ANCESTORS = new Set([
  'Actinopterygii',
  'Sarcopterygii',
  'Chondrichthyes',
  'Myxini',
  'Petromyzonti',
]);
const MAX_SCIENTIFIC_CHARS = 130;
const MAX_FACTS_PER_KIND = 24;
const MAX_UPSTREAM_BODY_CHARS = 512000;
const UPSTREAM_TIMEOUT_MS = 3500;
const USER_AGENT = 'NatureLens/1.0 (https://naturelensapp.cloud)';
const NO_STORE = 'private, no-store';
const NOT_FOUND_CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';
const PARTIAL_CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';
const SUCCESS_CACHE = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
const SOURCE_UNAVAILABLE = Symbol('sourceUnavailable');
const MAX_CONCURRENT_DOSSIERS = 6;
let activeDossierLoads = 0;

function acquireDossierSlot() {
  if (activeDossierLoads >= MAX_CONCURRENT_DOSSIERS) return false;
  activeDossierLoads += 1;
  return true;
}

function releaseDossierSlot() {
  activeDossierLoads = Math.max(0, activeDossierLoads - 1);
}

const REPRODUCTION_PROPERTIES = Object.freeze({
  clutchSize: 'P7725',
  incubationPeriod: 'P7770',
  gestationPeriod: 'P3063',
});
const LIFE_CYCLE_PROPERTIES = Object.freeze({
  lifeExpectancy: 'P2250',
  longestLifespan: 'P4214',
});

class UpstreamError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'UpstreamError';
    this.kind = kind;
  }
}

function singleQueryValue(value) {
  return typeof value === 'string' ? value : null;
}

function normaliseCategory(value) {
  const category = singleQueryValue(value)?.trim().toLowerCase();
  return VALID_CATEGORIES.has(category) ? category : null;
}

function normaliseLanguage(value) {
  const raw = singleQueryValue(value)?.trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return null;
  if (SUPPORTED_LANGUAGES.has(raw)) return raw;

  if (['zh-tw', 'zh-hk', 'zh-mo'].includes(raw)) return 'zh-hant';
  if (['zh-cn', 'zh-sg', 'zh-hans'].includes(raw)) return 'zh';

  const primary = raw.split('-')[0];
  return SUPPORTED_LANGUAGES.has(primary) ? primary : null;
}

function normaliseScientificName(value) {
  const raw = singleQueryValue(value);
  if (!raw) return null;
  const name = raw.trim().normalize('NFC');
  if (!name || name.length > MAX_SCIENTIFIC_CHARS) return null;

  // Binomio estrito bloqueia autoria, subespecie e texto livre antes do SPARQL.
  const binomial = /^\p{Lu}[\p{L}-]{1,63} \p{Ll}[\p{L}-]{1,63}$/u;
  return binomial.test(name) ? name : null;
}

function sparqlLiteral(value) {
  return JSON.stringify(value);
}

function wikidataIdentityPattern(scientific, category, aphiaId) {
  const exactName = sparqlLiteral(scientific);
  const lines = [
    `?taxon wdt:P225 ${exactName};`,
    '       wdt:P105 wd:Q7432.',
  ];

  if (category === 'fish') {
    lines.push(`?taxon wdt:P850 ${sparqlLiteral(String(aphiaId))}.`);
  }

  return lines.join('\n      ');
}

function wikidataFactBranch(scientific, property, kind, language) {
  return `{
    SELECT DISTINCT ?taxon ?kind ?value ?valueLabel WHERE {
      ?taxon wdt:P225 ${sparqlLiteral(scientific)};
             wdt:P105 wd:Q7432.
      ?taxon wdt:${property} ?value.
      ?value rdfs:label ?valueLabel.
      FILTER(LANG(?valueLabel) = ${sparqlLiteral(language)})
      BIND(${sparqlLiteral(kind)} AS ?kind)
    }
    ORDER BY ?value
    LIMIT ${MAX_FACTS_PER_KIND}
  }`;
}

function buildWikidataQuery({ scientific, category, language, aphiaId = null }) {
  const identity = wikidataIdentityPattern(scientific, category, aphiaId);
  const habitat = wikidataFactBranch(scientific, 'P2974', 'habitat', language);
  const diet = wikidataFactBranch(scientific, 'P1034', 'diet', language);

  // Apenas statements diretos entram nos fatos; ancestralidade nao herda dieta ou habitat.
  return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?taxon ?worms ?kind ?value ?valueLabel WHERE {
  {
    SELECT DISTINCT ?taxon ?worms WHERE {
      ${identity}
      ${category === 'fish' ? `?taxon wdt:P850 ?worms.` : ''}
    }
    LIMIT 2
  }
  {
    BIND("identity" AS ?kind)
  }
  UNION
  ${habitat}
  UNION
  ${diet}
}`;
}

function buildAncestryAskQuery(wikidataId, ancestorId) {
  if (!/^Q[1-9]\d*$/.test(wikidataId) || !/^Q[1-9]\d*$/.test(ancestorId)) return null;
  return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>

ASK {
  VALUES ?taxon { wd:${wikidataId} }
  ?taxon wdt:P171* wd:${ancestorId}.
}`;
}

function wormsRecordUrl(scientific) {
  return `https://www.marinespecies.org/rest/AphiaRecordsByName/${encodeURIComponent(scientific)}?like=false&marine_only=false`;
}

function wormsClassificationUrl(aphiaId) {
  return `https://www.marinespecies.org/rest/AphiaClassificationByAphiaID/${aphiaId}`;
}

function wikidataQueryUrl(query) {
  const params = new URLSearchParams({ format: 'json', query });
  return `https://query.wikidata.org/sparql?${params.toString()}`;
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const timeoutMs = options.timeoutMs || UPSTREAM_TIMEOUT_MS;
  const maxBodyChars = options.maxBodyChars || MAX_UPSTREAM_BODY_CHARS;
  if (typeof fetchImpl !== 'function') {
    throw new UpstreamError('response', 'fetch unavailable');
  }

  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const request = (async () => {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json, application/sparql-results+json',
        'User-Agent': USER_AGENT,
      },
      redirect: 'error',
      signal: controller.signal,
    });

    if (!response || !response.ok) {
      throw new UpstreamError('response', `upstream status ${response?.status || 0}`);
    }

    const declaredLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyChars) {
      throw new UpstreamError('payload', 'upstream body too large');
    }

    const text = await response.text();
    if (text.length > maxBodyChars) {
      throw new UpstreamError('payload', 'upstream body too large');
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new UpstreamError('payload', 'upstream returned invalid json');
    }
  })();

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new UpstreamError('timeout', 'upstream timeout'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (timedOut || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new UpstreamError('timeout', 'upstream timeout');
    }
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError('response', 'upstream request failed');
  } finally {
    clearTimeout(timer);
  }
}

function selectExactWormsRecord(payload, scientific) {
  if (!Array.isArray(payload)) return null;
  const exactById = new Map();

  for (const record of payload) {
    if (!record || typeof record !== 'object') continue;
    const aphiaId = Number(record.AphiaID);
    const validAphiaId = Number(record.valid_AphiaID);
    const exact =
      Number.isInteger(aphiaId) &&
      aphiaId > 0 &&
      aphiaId === validAphiaId &&
      record.scientificname === scientific &&
      record.valid_name === scientific &&
      String(record.status).toLowerCase() === 'accepted' &&
      String(record.rank).toLowerCase() === 'species' &&
      (!record.match_type || String(record.match_type).toLowerCase() === 'exact');
    if (exact) exactById.set(aphiaId, record);
  }

  return exactById.size === 1 ? [...exactById.values()][0] : null;
}

function flattenWormsClassification(payload) {
  const nodes = [];
  const seen = new Set();
  let node = payload;

  while (node && typeof node === 'object' && nodes.length < 64 && !seen.has(node)) {
    seen.add(node);
    nodes.push(node);
    node = node.child;
  }

  return nodes;
}

function isExactFishClassification(payload, scientific, aphiaId) {
  const nodes = flattenWormsClassification(payload);
  const leaf = nodes[nodes.length - 1];
  if (
    !leaf ||
    leaf.scientificname !== scientific ||
    Number(leaf.AphiaID) !== Number(aphiaId)
  ) {
    return false;
  }

  return nodes.some((node) => FISH_ANCESTORS.has(node.scientificname));
}

function wormsBoolean(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return null;
}

function environmentFromWorms(record) {
  const environment = {
    marine: wormsBoolean(record?.isMarine),
    brackish: wormsBoolean(record?.isBrackish),
    freshwater: wormsBoolean(record?.isFreshwater),
  };
  return Object.values(environment).every((value) => value === null) ? null : environment;
}

function cleanTaxonomyRank(value) {
  if (typeof value !== 'string') return null;
  const rank = value.trim().normalize('NFC');
  return rank && rank.length <= 100 && /^[\p{L}\p{M}.'\u2019 -]+$/u.test(rank)
    ? rank
    : null;
}

function compactTaxonomy(sourceId, scientific, ranks) {
  const taxonomy = { sourceId, species: scientific };
  for (const key of ['kingdom', 'phylum', 'className', 'order', 'family', 'genus']) {
    const clean = cleanTaxonomyRank(ranks?.[key]);
    if (clean) taxonomy[key] = clean;
  }
  return taxonomy;
}

function taxonomyFromWormsClassification(payload, scientific) {
  const rankKeys = {
    kingdom: 'kingdom',
    phylum: 'phylum',
    class: 'className',
    order: 'order',
    family: 'family',
    genus: 'genus',
  };
  const ranks = {};
  for (const node of flattenWormsClassification(payload)) {
    const key = rankKeys[String(node?.rank || '').trim().toLowerCase()];
    if (key) ranks[key] = node.scientificname;
  }
  return compactTaxonomy('worms', scientific, ranks);
}

function taxonomyFromGbifMatch(match) {
  return compactTaxonomy('gbif', match.scientific, match);
}

function wikidataEntityId(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/);
  return match ? match[1] : null;
}

function cleanLabel(binding, language) {
  if (!binding || binding.type !== 'literal') return null;
  if (String(binding['xml:lang'] || '').toLowerCase() !== language) return null;
  const label = typeof binding.value === 'string' ? binding.value.trim() : '';
  if (!label || label.length > 160 || /[\u0000-\u001f\u007f]/.test(label)) return null;
  return label;
}

function mapWikidataBindings(payload, { category, language, aphiaId = null }) {
  const bindings = payload?.results?.bindings;
  if (!Array.isArray(bindings)) return null;

  const taxonIds = new Set();
  const wormsIds = new Set();
  const facts = { diet: new Map(), habitat: new Map() };

  for (const row of bindings) {
    const taxonId = wikidataEntityId(row?.taxon?.value);
    if (!taxonId) continue;
    taxonIds.add(taxonId);

    if (row?.worms?.type === 'literal' && /^\d+$/.test(row.worms.value || '')) {
      wormsIds.add(String(row.worms.value));
    }

    const kind = row?.kind?.value;
    if (kind !== 'diet' && kind !== 'habitat') continue;
    const id = wikidataEntityId(row?.value?.value);
    const label = cleanLabel(row?.valueLabel, language);
    if (id && label && !facts[kind].has(id)) facts[kind].set(id, { id, label });
  }

  if (taxonIds.size !== 1) return null;
  if (category === 'fish' && (wormsIds.size !== 1 || !wormsIds.has(String(aphiaId)))) {
    return null;
  }

  const byLabel = (a, b) => a.label.localeCompare(b.label, language) || a.id.localeCompare(b.id);
  return {
    wikidataId: [...taxonIds][0],
    diet: [...facts.diet.values()].sort(byLabel).slice(0, MAX_FACTS_PER_KIND),
    habitat: [...facts.habitat.values()].sort(byLabel).slice(0, MAX_FACTS_PER_KIND),
  };
}

function mapWikidataAsk(payload) {
  return typeof payload?.boolean === 'boolean' ? payload.boolean : null;
}

function dedupeSources(sources) {
  const byId = new Map();
  for (const source of sources) {
    if (source?.id && !byId.has(source.id)) byId.set(source.id, source);
  }
  return [...byId.values()];
}

function wikidataSource(wikidataId) {
  return {
    id: 'wikidata',
    url: `https://www.wikidata.org/wiki/${wikidataId}`,
    license: 'CC0-1.0',
  };
}

function exactWikidataClaims(payload, wikidataId) {
  if (!/^Q[1-9]\d*$/.test(wikidataId || '')) return null;
  const entity = payload?.entities?.[wikidataId];
  return entity && !entity.missing && entity.claims && typeof entity.claims === 'object'
    ? entity.claims
    : null;
}

function mapStructuredClaims(claims) {
  if (!claims || typeof claims !== 'object') {
    return { reproduction: [], lifeCycle: [], conservation: null };
  }

  return {
    reproduction: [
      ...mapMeasurements(claims, REPRODUCTION_PROPERTIES.clutchSize, new Set(['count']))
        .map((value) => ({ id: 'clutchSize', ...value })),
      ...mapMeasurements(
        claims,
        REPRODUCTION_PROPERTIES.incubationPeriod,
        new Set(['hour', 'day', 'week', 'month'])
      ).map((value) => ({ id: 'incubationPeriod', ...value })),
      ...mapMeasurements(
        claims,
        REPRODUCTION_PROPERTIES.gestationPeriod,
        new Set(['day', 'week', 'month', 'year'])
      ).map((value) => ({ id: 'gestationPeriod', ...value })),
    ],
    lifeCycle: [
      ...mapMeasurements(
        claims,
        LIFE_CYCLE_PROPERTIES.lifeExpectancy,
        new Set(['day', 'week', 'month', 'year'])
      ).map((value) => ({ id: 'lifeExpectancy', ...value })),
      ...mapMeasurements(
        claims,
        LIFE_CYCLE_PROPERTIES.longestLifespan,
        new Set(['day', 'week', 'month', 'year'])
      ).map((value) => ({ id: 'longestLifespan', ...value })),
    ],
    conservation: mapConservation(claims),
  };
}

function wormsSource(aphiaId) {
  return {
    id: 'worms',
    url: `https://www.marinespecies.org/aphia.php?p=taxdetails&id=${aphiaId}`,
    license: 'CC-BY-4.0',
  };
}

async function loadFishDossier({ scientific, language }, options = {}) {
  const requestOptions = {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  };
  const records = await fetchJson(wormsRecordUrl(scientific), requestOptions);
  const record = selectExactWormsRecord(records, scientific);
  if (!record) return null;

  const aphiaId = Number(record.AphiaID);
  const query = buildWikidataQuery({
    scientific,
    category: 'fish',
    language,
    aphiaId,
  });
  const [classificationResult, wikidataResult] = await Promise.allSettled([
    fetchJson(wormsClassificationUrl(aphiaId), requestOptions),
    fetchJson(wikidataQueryUrl(query), requestOptions),
  ]);

  if (classificationResult.status === 'rejected') throw classificationResult.reason;
  const classification = classificationResult.value;
  if (!isExactFishClassification(classification, scientific, aphiaId)) return null;
  const taxonomy = taxonomyFromWormsClassification(classification, scientific);
  const mapped = wikidataResult.status === 'fulfilled'
    ? mapWikidataBindings(wikidataResult.value, {
      category: 'fish',
      language,
      aphiaId,
    })
    : null;

  const dossier = {
    scientific,
    taxonomy,
    environment: environmentFromWorms(record),
    diet: mapped?.diet || [],
    habitat: mapped?.habitat || [],
    lifeCycle: [],
    reproduction: [],
    conservation: null,
    sources: dedupeSources([
      wormsSource(aphiaId),
      ...(mapped ? [wikidataSource(mapped.wikidataId)] : []),
    ]),
  };
  if (wikidataResult.status === 'rejected') {
    Object.defineProperty(dossier, SOURCE_UNAVAILABLE, { value: true });
  }

  // O vinculo WoRMS + Wikidata ja foi provado acima. Claims so entram depois
  // dessa prova; uma falha aqui preserva o ambiente e os fatos ja confirmados.
  if (mapped) {
    try {
      const payload = await fetchJson(wikidataClaimsUrl(mapped.wikidataId), requestOptions);
      const claims = exactWikidataClaims(payload, mapped.wikidataId);
      if (claims) Object.assign(dossier, mapStructuredClaims(claims));
      else Object.defineProperty(dossier, SOURCE_UNAVAILABLE, { value: true });
    } catch (error) {
      Object.defineProperty(dossier, SOURCE_UNAVAILABLE, { value: true });
    }
  }

  const hasContent =
    Object.values(dossier.environment || {}).some((value) => value === true) ||
    dossier.diet.length > 0 ||
    dossier.habitat.length > 0 ||
    dossier.lifeCycle.length > 0 ||
    dossier.reproduction.length > 0 ||
    !!dossier.conservation;
  if (!hasContent && !dossier[SOURCE_UNAVAILABLE]) {
    // A classificacao exata continua util; vazio nas fontes editoriais nao
    // transforma uma especie verificada em um falso 404.
    Object.defineProperty(dossier, SOURCE_UNAVAILABLE, { value: true });
  }
  return dossier;
}

async function loadInvertebrateDossier({ scientific, language }, options = {}) {
  const query = buildWikidataQuery({
    scientific,
    category: 'insect',
    language,
  });
  const requestOptions = {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  };
  const [gbifResult, wikidataResult, globiResult] = await Promise.allSettled([
    fetchJson(gbifInvertebrateMatchUrl(scientific), requestOptions),
    fetchJson(wikidataQueryUrl(query), requestOptions),
    loadGlobiInteractions(scientific, fetchJson, requestOptions),
  ]);
  const mapped = wikidataResult.status === 'fulfilled'
    ? mapWikidataBindings(wikidataResult.value, { category: 'insect', language })
    : null;
  // GBIF cobre muito mais especies. Se ele estiver temporariamente fora do ar,
  // a prova anterior do Wikidata continua valida: Animalia e nao Chordata sao
  // consultados explicitamente antes de atribuir qualquer fato ao resultado.
  let gbif = null;
  let verifiedByWikidata = false;
  if (gbifResult.status === 'fulfilled') {
    gbif = selectExactGbifInvertebrate(gbifResult.value, scientific);
    if (!gbif) return null;
  } else {
    if (!mapped) throw gbifResult.reason;
    const [animal, chordate] = await Promise.all([
      fetchJson(wikidataQueryUrl(buildAncestryAskQuery(mapped.wikidataId, 'Q729')), requestOptions),
      fetchJson(wikidataQueryUrl(buildAncestryAskQuery(mapped.wikidataId, 'Q10915')), requestOptions),
    ]);
    verifiedByWikidata =
      mapWikidataAsk(animal) === true && mapWikidataAsk(chordate) === false;
    if (!verifiedByWikidata) return null;
  }
  const interactions = globiResult.status === 'fulfilled' && globiResult.value
    ? globiResult.value
    : {
      feeding: [],
      plantAssociations: [],
      ecologicalRelations: [],
      lifeStages: [],
      partial: true,
    };
  const hasGlobiFacts =
    interactions.feeding.length > 0 ||
    interactions.plantAssociations.length > 0 ||
    interactions.ecologicalRelations.length > 0 ||
    interactions.lifeStages.length > 0;

  const dossier = {
    scientific,
    taxonomy: gbif ? taxonomyFromGbifMatch(gbif) : null,
    environment: null,
    diet: mapped?.diet || [],
    habitat: mapped?.habitat || [],
    lifeCycle: [],
    reproduction: [],
    conservation: null,
    feeding: interactions.feeding,
    plantAssociations: interactions.plantAssociations,
    ecologicalRelations: interactions.ecologicalRelations,
    documentedLifeStages: interactions.lifeStages,
    sources: dedupeSources([
      ...(gbif ? [gbifSource(gbif.usageKey)] : []),
      ...(mapped ? [wikidataSource(mapped.wikidataId)] : []),
      ...(hasGlobiFacts ? [globiSource(scientific)] : []),
    ]),
  };
  if (
    gbifResult.status === 'rejected' ||
    wikidataResult.status === 'rejected' ||
    globiResult.status === 'rejected' ||
    interactions.partial
  ) {
    Object.defineProperty(dossier, SOURCE_UNAVAILABLE, { value: true });
  }

  // Claims so entram quando a entidade Wikidata exata foi ligada ao mesmo
  // binomio que o GBIF acabou de validar.
  if (mapped) {
    try {
      const payload = await fetchJson(wikidataClaimsUrl(mapped.wikidataId), requestOptions);
      const claims = exactWikidataClaims(payload, mapped.wikidataId);
      if (claims) Object.assign(dossier, mapStructuredClaims(claims));
      else Object.defineProperty(dossier, SOURCE_UNAVAILABLE, { value: true });
    } catch (error) {
      Object.defineProperty(dossier, SOURCE_UNAVAILABLE, { value: true });
    }
  }

  const hasContent =
    dossier.diet.length > 0 ||
    dossier.habitat.length > 0 ||
    dossier.lifeCycle.length > 0 ||
    dossier.reproduction.length > 0 ||
    !!dossier.conservation ||
    dossier.feeding.length > 0 ||
    dossier.plantAssociations.length > 0 ||
    dossier.ecologicalRelations.length > 0 ||
    dossier.documentedLifeStages.length > 0;
  if (!hasContent) {
    if (!gbif) return null;
    if (!dossier[SOURCE_UNAVAILABLE]) {
      // GBIF ja confirmou o binomio e a classificacao. Falta de conteudo nas
      // demais fontes e um estado parcial recuperavel, nao "nao verificado".
      Object.defineProperty(dossier, SOURCE_UNAVAILABLE, { value: true });
    }
  }
  return dossier;
}

async function loadCategoryDossier({ category, scientific, language, includeWiki = false }, options = {}) {
  const requestOptions = {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  };
  if (GENERIC_WIKI_CATEGORIES.has(category)) {
    return loadGenericWikiDossier({ scientific, category, language }, {
      fetchJson,
      requestOptions,
    });
  }

  const basePromise = category === 'fish'
    ? loadFishDossier({ scientific, language }, options)
    : category === 'bird'
      ? loadBirdDossier({ scientific, language }, options)
      : loadInvertebrateDossier({ scientific, language }, options);
  if (!includeWiki) return basePromise;

  const [baseResult, wikiResult] = await Promise.allSettled([
    basePromise,
    loadWikipediaSections({ scientific, category, language }, {
      fetchJson,
      requestOptions,
    }),
  ]);
  if (baseResult.status === 'rejected') throw baseResult.reason;
  const dossier = baseResult.value;
  if (!dossier) return null;
  const wiki = wikiResult.status === 'fulfilled' ? wikiResult.value : null;
  if (!wiki) return dossier;
  const inheritedPartial = Boolean(
    dossier.partial || dossier[SOURCE_UNAVAILABLE] || dossier[BIRD_SOURCE_UNAVAILABLE]
  );
  return {
    ...dossier,
    wikiSections: wiki.sections,
    sources: dedupeSources([...(dossier.sources || []), wiki.source]),
    partial: inheritedPartial,
  };
}

function sendError(res, status, error, cacheControl = NO_STORE) {
  res.setHeader('Cache-Control', cacheControl);
  res.status(status).json({ error });
}

async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', NO_STORE);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendError(res, 405, 'method_not_allowed');
    return;
  }

  const category = normaliseCategory(req.query?.category);
  const scientific = normaliseScientificName(req.query?.scientificName);
  const language = normaliseLanguage(req.query?.language);
  const includeWiki = singleQueryValue(req.query?.wiki) === '1';
  if (!category || !scientific || !language) {
    sendError(res, 400, 'invalid_request');
    return;
  }
  // A cache protege nomes repetidos; este limite protege a mesma instancia de
  // uma enxurrada de binomios aleatorios, cada qual acionando fontes publicas.
  if (!acquireDossierSlot()) {
    res.setHeader('Retry-After', '2');
    sendError(res, 503, 'source_busy');
    return;
  }

  try {
    const dossier = await loadCategoryDossier({
      category,
      scientific,
      language,
      includeWiki,
    });

    if (!dossier) {
      sendError(res, 404, 'species_not_verified', NOT_FOUND_CACHE);
      return;
    }

    const partial = Boolean(
      dossier.partial || dossier[SOURCE_UNAVAILABLE] || dossier[BIRD_SOURCE_UNAVAILABLE]
    );
    res.setHeader('Cache-Control', partial ? PARTIAL_CACHE : SUCCESS_CACHE);
    // The Symbol stays server-only; the explicit flag lets clients render
    // proven facts now without pinning a transient upstream outage in memory.
    res.status(200).json({ ...dossier, partial });
  } catch (error) {
    if (
      (error instanceof UpstreamError || error instanceof BirdUpstreamError) &&
      error.kind === 'timeout'
    ) {
      sendError(res, 504, 'source_timeout');
      return;
    }
    sendError(res, 502, 'source_unavailable');
  } finally {
    releaseDossierSlot();
  }
}

module.exports = handler;
module.exports.UpstreamError = UpstreamError;
module.exports.MAX_CONCURRENT_DOSSIERS = MAX_CONCURRENT_DOSSIERS;
module.exports.acquireDossierSlot = acquireDossierSlot;
module.exports.buildAncestryAskQuery = buildAncestryAskQuery;
module.exports.buildWikidataQuery = buildWikidataQuery;
module.exports.cleanLabel = cleanLabel;
module.exports.dedupeSources = dedupeSources;
module.exports.environmentFromWorms = environmentFromWorms;
module.exports.exactWikidataClaims = exactWikidataClaims;
module.exports.fetchJson = fetchJson;
module.exports.flattenWormsClassification = flattenWormsClassification;
module.exports.isExactFishClassification = isExactFishClassification;
module.exports.loadFishDossier = loadFishDossier;
module.exports.loadInvertebrateDossier = loadInvertebrateDossier;
module.exports.loadBirdDossier = loadBirdDossier;
module.exports.loadCategoryDossier = loadCategoryDossier;
module.exports.mapWikidataBindings = mapWikidataBindings;
module.exports.mapWikidataAsk = mapWikidataAsk;
module.exports.mapStructuredClaims = mapStructuredClaims;
module.exports.normaliseCategory = normaliseCategory;
module.exports.normaliseLanguage = normaliseLanguage;
module.exports.normaliseScientificName = normaliseScientificName;
module.exports.releaseDossierSlot = releaseDossierSlot;
module.exports.selectExactWormsRecord = selectExactWormsRecord;
module.exports.taxonomyFromWormsClassification = taxonomyFromWormsClassification;
module.exports.wikidataEntityId = wikidataEntityId;
module.exports.wikidataQueryUrl = wikidataQueryUrl;
module.exports.wormsClassificationUrl = wormsClassificationUrl;
module.exports.wormsRecordUrl = wormsRecordUrl;
