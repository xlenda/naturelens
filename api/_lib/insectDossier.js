const GLOBI_INTERACTION_TYPES = Object.freeze([
  'eats',
  'preysOn',
  'pollinates',
  'visitsFlowersOf',
  'hasHost',
  'parasiteOf',
  'parasitoidOf',
  'vectorOf',
]);

const GLOBI_FIELDS = Object.freeze([
  'source_taxon_name',
  'source_specimen_life_stage',
  'interaction_type',
  'target_taxon_name',
  'target_taxon_external_id',
  'target_taxon_path',
]);

const MAX_INTERACTIONS_PER_QUERY = 32;
const MAX_FACTS_PER_BUCKET = 18;
const GBIF_ANIMALIA_KEY = 1;

function cleanGbifRank(value) {
  if (typeof value !== 'string') return null;
  const rank = value.trim().normalize('NFC');
  return rank && rank.length <= 100 && /^[\p{L}\p{M}.'\u2019 -]+$/u.test(rank)
    ? rank
    : null;
}

function gbifInvertebrateMatchUrl(scientific) {
  const params = new URLSearchParams({
    name: scientific,
    rank: 'SPECIES',
    strict: 'true',
    verbose: 'true',
  });
  return `https://api.gbif.org/v1/species/match?${params.toString()}`;
}

function selectExactGbifInvertebrate(payload, scientific) {
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
    String(payload.kingdom) === 'Animalia' &&
    Number(payload.kingdomKey) === GBIF_ANIMALIA_KEY &&
    typeof payload.phylum === 'string' &&
    payload.phylum.length > 0 &&
    payload.phylum !== 'Chordata';

  if (!exact) return null;

  return {
    usageKey,
    scientific,
    kingdom: 'Animalia',
    phylum: cleanGbifRank(payload.phylum),
    className: cleanGbifRank(payload.class),
    order: cleanGbifRank(payload.order),
    family: cleanGbifRank(payload.family),
    genus: cleanGbifRank(payload.genus),
  };
}

function globiInteractionUrl(scientific, relation) {
  if (!GLOBI_INTERACTION_TYPES.includes(relation)) return null;
  const params = new URLSearchParams();
  params.set('sourceTaxon', scientific);
  params.set('interactionType', relation);
  for (const field of GLOBI_FIELDS) params.append('field', field);
  params.set('includeObservations', 'false');
  params.set('limit', String(MAX_INTERACTIONS_PER_QUERY));
  params.set('type', 'json');
  return `https://api.globalbioticinteractions.org/interaction?${params.toString()}`;
}

function cleanTargetId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return /^(?:GBIF|EOL|NCBI|ITIS|IRMNG):[1-9]\d*$/.test(id) ||
    /^WD:Q[1-9]\d*$/.test(id) ||
    /^COL:[A-Z0-9]{2,24}$/.test(id)
    ? id
    : null;
}

function cleanTaxonName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ').normalize('NFC');
  if (!name || name.length > 160 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  const exactTaxon = /^\p{Lu}[\p{L}\p{M}.'\u2019-]{1,63} (?:(?:\u00d7|x)\s*)?\p{Ll}[\p{L}\p{M}.'\u2019-]{1,63}(?: (?:subsp\.|ssp\.|var\.|f\.) \p{Ll}[\p{L}\p{M}.'\u2019-]{1,63})?$/u;
  return exactTaxon.test(name) ? name : null;
}

function pathIsPlant(value) {
  if (typeof value !== 'string') return false;
  const ranks = new Set(value.split('|').map((item) => item.trim().toLowerCase()).filter(Boolean));
  return [
    'plantae',
    'viridiplantae',
    'archaeplastida',
    'streptophyta',
    'tracheophyta',
    'spermatophytes',
    'magnoliophyta',
  ].some((rank) => ranks.has(rank));
}

function normaliseLifeStage(value) {
  if (typeof value !== 'string') return null;
  const stage = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (/^(?:egg|eggs|ovum|ova)$/.test(stage)) return 'egg';
  if (/^(?:larva|larvae|larval|caterpillar)$/.test(stage)) return 'larva';
  if (/^(?:pupa|pupae|pupal|puparium|chrysalis)$/.test(stage)) return 'pupa';
  if (/^(?:nymph|nymphal|juvenile|immature)$/.test(stage)) return 'nymph';
  if (/^(?:adult|adults|imago)$/.test(stage)) return 'adult';
  return null;
}

function rowObject(columns, row) {
  if (!Array.isArray(columns) || !Array.isArray(row) || row.length < columns.length) return null;
  const result = {};
  for (let index = 0; index < columns.length; index += 1) {
    const key = columns[index];
    if (typeof key === 'string' && !(key in result)) result[key] = row[index];
  }
  return result;
}

function interactionFact(row, relation) {
  const id = cleanTargetId(row?.target_taxon_external_id);
  const name = cleanTaxonName(row?.target_taxon_name);
  if (!id || !name) return null;
  return { id: `${relation}:${id}`, name, relation };
}

function mapGlobiInteractionPayload(payload, scientific, relation) {
  if (!GLOBI_INTERACTION_TYPES.includes(relation)) return null;
  const columns = payload?.columns;
  const rows = payload?.data;
  if (!Array.isArray(columns) || !Array.isArray(rows)) return null;
  if (!GLOBI_FIELDS.every((field) => columns.includes(field))) return null;

  const feeding = [];
  const plantAssociations = [];
  const ecologicalRelations = [];
  const lifeStages = new Set();

  for (const raw of rows.slice(0, MAX_INTERACTIONS_PER_QUERY)) {
    const row = rowObject(columns, raw);
    if (!row || row.source_taxon_name !== scientific || row.interaction_type !== relation) continue;
    // O estagio descreve o exemplar-origem e continua sendo evidencia mesmo
    // quando o alvo da interacao veio sem id taxonomico utilizavel. Validar o
    // alvo primeiro apagava ovos/larvas reais de varias respostas GloBI.
    const stage = normaliseLifeStage(row.source_specimen_life_stage);
    if (stage) lifeStages.add(stage);
    const fact = interactionFact(row, relation);
    if (!fact) continue;
    const plant = pathIsPlant(row.target_taxon_path);

    if (relation === 'eats' || relation === 'preysOn') feeding.push(fact);
    if (
      plant &&
      ['eats', 'pollinates', 'visitsFlowersOf', 'hasHost', 'parasiteOf'].includes(relation)
    ) {
      plantAssociations.push(fact);
    }
    if (['preysOn', 'pollinates', 'visitsFlowersOf', 'hasHost', 'parasiteOf', 'parasitoidOf', 'vectorOf'].includes(relation)) {
      ecologicalRelations.push(fact);
    }
  }

  return {
    feeding,
    plantAssociations,
    ecologicalRelations,
    lifeStages: [...lifeStages],
  };
}

function mergeFacts(results, key) {
  const byId = new Map();
  for (const result of results) {
    for (const fact of result?.[key] || []) {
      const id = `${fact.relation}:${fact.id}`;
      if (!byId.has(id)) byId.set(id, fact);
    }
  }
  return [...byId.values()]
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .slice(0, MAX_FACTS_PER_BUCKET);
}

async function loadGlobiInteractions(scientific, fetchJson, options = {}) {
  if (typeof fetchJson !== 'function') return null;
  const settled = await Promise.allSettled(GLOBI_INTERACTION_TYPES.map(async (relation) => {
    const payload = await fetchJson(globiInteractionUrl(scientific, relation), {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
      maxBodyChars: 96000,
    });
    return mapGlobiInteractionPayload(payload, scientific, relation);
  }));
  const fulfilled = settled
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value);
  const lifeStages = new Set(fulfilled.flatMap((result) => result.lifeStages));

  return {
    feeding: mergeFacts(fulfilled, 'feeding'),
    plantAssociations: mergeFacts(fulfilled, 'plantAssociations'),
    ecologicalRelations: mergeFacts(fulfilled, 'ecologicalRelations'),
    lifeStages: ['egg', 'larva', 'nymph', 'pupa', 'adult'].filter((stage) => lifeStages.has(stage)),
    partial: settled.some((result) => result.status === 'rejected'),
  };
}

function gbifSource(usageKey) {
  return {
    id: 'gbif',
    url: `https://www.gbif.org/species/${usageKey}`,
    license: 'CC-BY-4.0',
  };
}

function globiSource(scientific) {
  return {
    id: 'globi',
    url: `https://globalbioticinteractions.org/?sourceTaxon=${encodeURIComponent(scientific)}`,
    license: 'CC-BY-4.0',
  };
}

module.exports = {
  GLOBI_INTERACTION_TYPES,
  gbifInvertebrateMatchUrl,
  gbifSource,
  globiInteractionUrl,
  globiSource,
  loadGlobiInteractions,
  mapGlobiInteractionPayload,
  normaliseLifeStage,
  pathIsPlant,
  selectExactGbifInvertebrate,
};
