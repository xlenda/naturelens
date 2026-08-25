const MAX_UPSTREAM_BODY_CHARS = 512000;
const UPSTREAM_TIMEOUT_MS = 3500;
const USER_AGENT = 'NatureLens/1.0 (https://naturelensapp.cloud)';
const MAX_FACTS_PER_KIND = 24;
const MAX_MEASUREMENTS_PER_KIND = 6;
const BIRD_CLASS_KEY = 212;
const BIRD_SOURCE_UNAVAILABLE = Symbol('birdSourceUnavailable');
const birdLabelCache = new Map();
const birdLabelInflight = new Map();
const MAX_LABEL_CACHE_ENTRIES = 512;

const FACT_PROPERTIES = Object.freeze({
  diet: 'P1034',
  habitat: 'P2974',
});

const MEASUREMENT_PROPERTIES = Object.freeze({
  clutchSize: 'P7725',
  incubationPeriod: 'P7770',
  lifeExpectancy: 'P2250',
  longestLifespan: 'P4214',
});

const UNIT_BY_URI = Object.freeze({
  '1': 'count',
  'http://www.wikidata.org/entity/Q25235': 'hour',
  'http://www.wikidata.org/entity/Q573': 'day',
  'http://www.wikidata.org/entity/Q23387': 'week',
  'http://www.wikidata.org/entity/Q5151': 'month',
  'http://www.wikidata.org/entity/Q577': 'year',
});

// P141 aceita estes itens segundo a propria restricao da propriedade. Duas
// entidades historicas existem para EN; ambas representam a mesma categoria.
const IUCN_CODE_BY_QID = Object.freeze({
  Q237350: 'EX',
  Q239509: 'EW',
  Q219127: 'CR',
  Q11394: 'EN',
  Q96377276: 'EN',
  Q278113: 'VU',
  Q719675: 'NT',
  Q211005: 'LC',
  Q3245245: 'DD',
  Q3350324: 'NE',
});

class BirdUpstreamError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'BirdUpstreamError';
    this.kind = kind;
  }
}

function sparqlLiteral(value) {
  return JSON.stringify(value);
}

function wikidataEntityId(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/);
  return match ? match[1] : null;
}

function gbifBirdMatchUrl(scientific) {
  const params = new URLSearchParams({
    name: scientific,
    strict: 'true',
    verbose: 'true',
  });
  return `https://api.gbif.org/v1/species/match?${params.toString()}`;
}

function buildBirdIdentityQuery(scientific) {
  return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>

SELECT ?taxon ?gbif WHERE {
  ?taxon wdt:P225 ${sparqlLiteral(scientific)};
         wdt:P105 wd:Q7432;
         wdt:P171* wd:Q5113.
  OPTIONAL { ?taxon wdt:P846 ?gbif. }
}
LIMIT 3`;
}

function normaliseBirdLabel(value) {
  if (typeof value !== 'string') return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const label = value.trim().replace(/\s+/g, ' ').normalize('NFC');
  if (!label || label.length > 100) return null;
  return label;
}

function buildBirdLabelQuery(label) {
  const exact = normaliseBirdLabel(label);
  if (!exact) return null;
  const lower = exact.toLocaleLowerCase('en');
  const values = [...new Set([exact, lower])]
    .map((item) => `${sparqlLiteral(item)}@en`)
    .join(' ');
  return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?taxon ?scientific ?gbif WHERE {
  VALUES ?common { ${values} }
  ?taxon wdt:P105 wd:Q7432;
         wdt:P171* wd:Q5113;
         wdt:P225 ?scientific.
  { ?taxon rdfs:label ?common. }
  UNION
  { ?taxon skos:altLabel ?common. }
  OPTIONAL { ?taxon wdt:P846 ?gbif. }
}
LIMIT 3`;
}

function wikidataQueryUrl(query) {
  const params = new URLSearchParams({ format: 'json', query });
  return `https://query.wikidata.org/sparql?${params.toString()}`;
}

function wikidataClaimsUrl(wikidataId) {
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: wikidataId,
    props: 'claims',
    format: 'json',
    origin: '*',
  });
  return `https://www.wikidata.org/w/api.php?${params.toString()}`;
}

function wikidataLabelsUrl(ids, language) {
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: ids.join('|'),
    props: 'labels',
    languages: language,
    languagefallback: '0',
    format: 'json',
    origin: '*',
  });
  return `https://www.wikidata.org/w/api.php?${params.toString()}`;
}

async function fetchBirdJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const timeoutMs = options.timeoutMs || UPSTREAM_TIMEOUT_MS;
  const maxBodyChars = options.maxBodyChars || MAX_UPSTREAM_BODY_CHARS;
  if (typeof fetchImpl !== 'function') {
    throw new BirdUpstreamError('response', 'fetch unavailable');
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
    if (!response?.ok) {
      throw new BirdUpstreamError('response', `upstream status ${response?.status || 0}`);
    }

    const declaredLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyChars) {
      throw new BirdUpstreamError('payload', 'upstream body too large');
    }
    const text = await response.text();
    if (text.length > maxBodyChars) {
      throw new BirdUpstreamError('payload', 'upstream body too large');
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new BirdUpstreamError('payload', 'upstream returned invalid json');
    }
  })();

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new BirdUpstreamError('timeout', 'upstream timeout'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (timedOut || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new BirdUpstreamError('timeout', 'upstream timeout');
    }
    if (error instanceof BirdUpstreamError) throw error;
    throw new BirdUpstreamError('response', 'upstream request failed');
  } finally {
    clearTimeout(timer);
  }
}

function selectExactGbifBird(payload, scientific) {
  if (!payload || typeof payload !== 'object') return null;
  const usageKey = Number(payload.usageKey);
  const exact =
    Number.isInteger(usageKey) &&
    usageKey > 0 &&
    payload.canonicalName === scientific &&
    payload.species === scientific &&
    Number(payload.speciesKey) === usageKey &&
    String(payload.rank).toUpperCase() === 'SPECIES' &&
    String(payload.status).toUpperCase() === 'ACCEPTED' &&
    String(payload.matchType).toUpperCase() === 'EXACT' &&
    Number.isFinite(payload.confidence) &&
    payload.confidence >= 95 &&
    String(payload.class) === 'Aves' &&
    Number(payload.classKey) === BIRD_CLASS_KEY;
  return exact ? { usageKey, scientific } : null;
}

function mapBirdIdentity(payload, scientific, gbifKey) {
  const bindings = payload?.results?.bindings;
  if (!Array.isArray(bindings)) return null;
  const matches = new Map();

  for (const row of bindings) {
    const id = wikidataEntityId(row?.taxon?.value);
    if (!id) continue;
    const declaredGbif = row?.gbif?.type === 'literal' && /^\d+$/.test(row.gbif.value || '')
      ? String(row.gbif.value)
      : null;
    if (!matches.has(id)) matches.set(id, new Set());
    if (declaredGbif) matches.get(id).add(declaredGbif);
  }

  if (matches.size !== 1) return null;
  const [wikidataId, declaredIds] = [...matches.entries()][0];
  if (declaredIds.size > 1) return null;
  if (declaredIds.size === 1 && !declaredIds.has(String(gbifKey))) return null;
  return { scientific, gbifKey: Number(gbifKey), wikidataId };
}

function mapBirdLabelIdentity(payload) {
  const bindings = payload?.results?.bindings;
  if (!Array.isArray(bindings)) return null;
  const matches = new Map();
  for (const row of bindings) {
    const wikidataId = wikidataEntityId(row?.taxon?.value);
    const scientific = row?.scientific?.type === 'literal'
      ? String(row.scientific.value || '').trim()
      : null;
    if (
      !wikidataId ||
      !scientific ||
      !/^\p{Lu}[\p{L}-]{1,63} \p{Ll}[\p{L}-]{1,63}$/u.test(scientific)
    ) {
      continue;
    }
    const gbif = row?.gbif?.type === 'literal' && /^\d+$/.test(row.gbif.value || '')
      ? String(row.gbif.value)
      : null;
    const key = `${wikidataId}:${scientific}`;
    if (!matches.has(key)) matches.set(key, { wikidataId, scientific, gbifIds: new Set() });
    if (gbif) matches.get(key).gbifIds.add(gbif);
  }
  if (matches.size !== 1) return null;
  const match = [...matches.values()][0];
  if (match.gbifIds.size > 1) return null;
  return match;
}

function bestClaims(claims, property) {
  const list = Array.isArray(claims?.[property])
    ? claims[property].filter((claim) => claim?.rank !== 'deprecated')
    : [];
  const preferred = list.filter((claim) => claim?.rank === 'preferred');
  return preferred.length ? preferred : list.filter((claim) => claim?.rank === 'normal');
}

function claimEntityId(claim) {
  const snak = claim?.mainsnak;
  const id = snak?.snaktype === 'value' && snak?.datavalue?.type === 'wikibase-entityid'
    ? snak.datavalue.value?.id
    : null;
  return typeof id === 'string' && /^Q[1-9]\d*$/.test(id) ? id : null;
}

function claimEntityIds(claims, property) {
  const ids = new Set();
  for (const claim of bestClaims(claims, property)) {
    const id = claimEntityId(claim);
    if (id) ids.add(id);
  }
  return [...ids].slice(0, MAX_FACTS_PER_KIND);
}

function cleanQuantity(value) {
  if (!value || typeof value !== 'object') return null;
  const amount = Number(value.amount);
  const unit = UNIT_BY_URI[value.unit];
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000 || !unit) return null;

  // Limites diferentes carregam incerteza. O app nao descarta essa nuance nem
  // transforma o ponto central em uma certeza ou intervalo inventado.
  const lower = value.lowerBound === undefined ? amount : Number(value.lowerBound);
  const upper = value.upperBound === undefined ? amount : Number(value.upperBound);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower !== amount || upper !== amount) {
    return null;
  }
  return { amount, unit };
}

function mapMeasurements(claims, property, allowedUnits) {
  const byValue = new Map();
  for (const claim of bestClaims(claims, property)) {
    const snak = claim?.mainsnak;
    const value = snak?.snaktype === 'value' && snak?.datavalue?.type === 'quantity'
      ? cleanQuantity(snak.datavalue.value)
      : null;
    if (!value || !allowedUnits.has(value.unit)) continue;
    const key = `${value.amount}:${value.unit}`;
    if (!byValue.has(key)) byValue.set(key, value);
  }
  return [...byValue.values()].slice(0, MAX_MEASUREMENTS_PER_KIND);
}

function mapConservation(claims) {
  const statements = bestClaims(claims, 'P141');
  if (!statements.length) return null;
  const codes = new Set();
  for (const claim of statements) {
    const id = claimEntityId(claim);
    const code = id ? IUCN_CODE_BY_QID[id] : null;
    if (!code) return null;
    codes.add(code);
  }
  return codes.size === 1 ? { code: [...codes][0] } : null;
}

function mapExactLabels(payload, ids, language) {
  const labels = new Map();
  for (const id of ids) {
    const label = payload?.entities?.[id]?.labels?.[language];
    const text = label?.language === language && typeof label.value === 'string'
      ? label.value.trim()
      : '';
    if (text && text.length <= 160 && !/[\u0000-\u001f\u007f]/.test(text)) {
      labels.set(id, text);
    }
  }
  return labels;
}

function wikidataClaims(payload, wikidataId) {
  const entity = payload?.entities?.[wikidataId];
  return entity && !entity.missing && entity.claims && typeof entity.claims === 'object'
    ? entity.claims
    : null;
}

function gbifSource(gbifKey) {
  return {
    id: 'gbif',
    url: `https://www.gbif.org/species/${gbifKey}`,
    license: 'CC-BY-4.0',
  };
}

function wikidataSource(wikidataId) {
  return {
    id: 'wikidata',
    url: `https://www.wikidata.org/wiki/${wikidataId}`,
    license: 'CC0-1.0',
  };
}

function emptyBirdDossier(scientific, gbifKey) {
  return {
    scientific,
    environment: null,
    diet: [],
    habitat: [],
    lifeCycle: [],
    reproduction: [],
    conservation: null,
    sources: [gbifSource(gbifKey)],
  };
}

async function loadBirdDossier({ scientific, language }, options = {}) {
  const requestOptions = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
  const matchPayload = await fetchBirdJson(gbifBirdMatchUrl(scientific), requestOptions);
  const gbif = selectExactGbifBird(matchPayload, scientific);
  if (!gbif) return null;

  const dossier = emptyBirdDossier(scientific, gbif.usageKey);
  let identityPayload;
  try {
    identityPayload = await fetchBirdJson(
      wikidataQueryUrl(buildBirdIdentityQuery(scientific)),
      requestOptions
    );
  } catch (error) {
    Object.defineProperty(dossier, BIRD_SOURCE_UNAVAILABLE, { value: true });
    return dossier;
  }

  const identity = mapBirdIdentity(identityPayload, scientific, gbif.usageKey);
  if (!identity) return dossier;

  let claimsPayload;
  try {
    claimsPayload = await fetchBirdJson(wikidataClaimsUrl(identity.wikidataId), requestOptions);
  } catch (error) {
    Object.defineProperty(dossier, BIRD_SOURCE_UNAVAILABLE, { value: true });
    return dossier;
  }
  const claims = wikidataClaims(claimsPayload, identity.wikidataId);
  if (!claims) {
    Object.defineProperty(dossier, BIRD_SOURCE_UNAVAILABLE, { value: true });
    return dossier;
  }

  dossier.sources.push(wikidataSource(identity.wikidataId));
  dossier.conservation = mapConservation(claims);
  dossier.reproduction = [
    ...mapMeasurements(claims, MEASUREMENT_PROPERTIES.clutchSize, new Set(['count']))
      .map((value) => ({ id: 'clutchSize', ...value })),
    ...mapMeasurements(claims, MEASUREMENT_PROPERTIES.incubationPeriod, new Set(['hour', 'day', 'week', 'month']))
      .map((value) => ({ id: 'incubationPeriod', ...value })),
  ];
  dossier.lifeCycle = [
    ...mapMeasurements(claims, MEASUREMENT_PROPERTIES.lifeExpectancy, new Set(['day', 'week', 'month', 'year']))
      .map((value) => ({ id: 'lifeExpectancy', ...value })),
    ...mapMeasurements(claims, MEASUREMENT_PROPERTIES.longestLifespan, new Set(['day', 'week', 'month', 'year']))
      .map((value) => ({ id: 'longestLifespan', ...value })),
  ];

  const idsByKind = {
    diet: claimEntityIds(claims, FACT_PROPERTIES.diet),
    habitat: claimEntityIds(claims, FACT_PROPERTIES.habitat),
  };
  const factIds = [...new Set([...idsByKind.diet, ...idsByKind.habitat])];
  if (!factIds.length) return dossier;

  try {
    const labelPayload = await fetchBirdJson(wikidataLabelsUrl(factIds, language), requestOptions);
    const labels = mapExactLabels(labelPayload, factIds, language);
    dossier.diet = idsByKind.diet
      .filter((id) => labels.has(id))
      .map((id) => ({ id, label: labels.get(id) }));
    dossier.habitat = idsByKind.habitat
      .filter((id) => labels.has(id))
      .map((id) => ({ id, label: labels.get(id) }));
  } catch (error) {
    Object.defineProperty(dossier, BIRD_SOURCE_UNAVAILABLE, { value: true });
  }
  return dossier;
}

async function resolveExactBirdLabel(label, options = {}) {
  const exactLabel = normaliseBirdLabel(label);
  if (!exactLabel) return null;
  const cacheKey = exactLabel.toLocaleLowerCase('en');
  if (birdLabelCache.has(cacheKey)) return birdLabelCache.get(cacheKey);
  if (birdLabelInflight.has(cacheKey)) return birdLabelInflight.get(cacheKey);

  const pending = (async () => {
    try {
      const requestOptions = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
      const query = buildBirdLabelQuery(exactLabel);
      const payload = await fetchBirdJson(wikidataQueryUrl(query), requestOptions);
      const candidate = mapBirdLabelIdentity(payload);
      if (!candidate) {
        birdLabelCache.set(cacheKey, null);
        return null;
      }

      const matchPayload = await fetchBirdJson(gbifBirdMatchUrl(candidate.scientific), requestOptions);
      const gbif = selectExactGbifBird(matchPayload, candidate.scientific);
      if (!gbif) {
        birdLabelCache.set(cacheKey, null);
        return null;
      }
      if (candidate.gbifIds.size === 1 && !candidate.gbifIds.has(String(gbif.usageKey))) {
        birdLabelCache.set(cacheKey, null);
        return null;
      }

      const result = {
        scientific: candidate.scientific,
        gbifKey: gbif.usageKey,
        wikidataId: candidate.wikidataId,
      };
      if (birdLabelCache.size >= MAX_LABEL_CACHE_ENTRIES) {
        birdLabelCache.delete(birdLabelCache.keys().next().value);
      }
      birdLabelCache.set(cacheKey, result);
      return result;
    } finally {
      birdLabelInflight.delete(cacheKey);
    }
  })();

  birdLabelInflight.set(cacheKey, pending);
  return pending;
}

function clearBirdLabelCache() {
  birdLabelCache.clear();
  birdLabelInflight.clear();
}

module.exports = {
  BIRD_SOURCE_UNAVAILABLE,
  BirdUpstreamError,
  buildBirdIdentityQuery,
  buildBirdLabelQuery,
  clearBirdLabelCache,
  fetchBirdJson,
  gbifBirdMatchUrl,
  loadBirdDossier,
  mapBirdIdentity,
  mapBirdLabelIdentity,
  mapConservation,
  mapExactLabels,
  mapMeasurements,
  selectExactGbifBird,
  resolveExactBirdLabel,
  wikidataClaimsUrl,
  wikidataLabelsUrl,
};
