const SOURCE_RULES = Object.freeze({
  worms: {
    license: 'CC-BY-4.0',
    url: /^https:\/\/www\.marinespecies\.org\/aphia\.php\?p=taxdetails&id=[1-9]\d*$/,
  },
  gbif: {
    license: 'CC-BY-4.0',
    url: /^https:\/\/www\.gbif\.org\/species\/[1-9]\d*$/,
  },
  wikidata: {
    license: 'CC0-1.0',
    url: /^https:\/\/www\.wikidata\.org\/wiki\/Q[1-9]\d*$/,
  },
  wikipedia: {
    license: 'CC-BY-SA-4.0',
    url: /^https:\/\/(?:en|pt|es|de|fr|it|nl|pl|sv|da|cs|tr|ko|zh|hi|ar)\.wikipedia\.org\/wiki\/[^?#\s]+$/u,
  },
});

const MISSING_DATA_BEHAVIOUR = 'omit-section';

function source({ id, sections, mode, catalogueSize = null, countsTowardExactDossier = true }) {
  return Object.freeze({
    id,
    sections: Object.freeze([...sections]),
    mode,
    catalogueSize,
    countsTowardExactDossier,
    exhaustive: false,
  });
}

function category({ sections, sources, limitations }) {
  return Object.freeze({
    sections: Object.freeze([...sections]),
    sources: Object.freeze([...sources]),
    missingData: MISSING_DATA_BEHAVIOUR,
    coverage: Object.freeze({
      status: 'partial',
      exhaustive: false,
      limitations: Object.freeze([...limitations]),
    }),
  });
}

const CATEGORY_DEPTH_MATRIX = Object.freeze({
  plant: category({
    sections: [
      'identityEvidence', 'safety', 'water', 'lightClimate', 'soil', 'nutrition',
      'phenology', 'propagation', 'usesEdibility', 'habitat', 'distribution',
      'seasonality', 'problems', 'conservation',
    ],
    sources: [
      source({
        id: 'kindwise-plant',
        sections: ['identityEvidence', 'safety', 'usesEdibility', 'problems'],
        mode: 'dynamic-provider',
      }),
      source({
        id: 'usda-plants',
        sections: ['water', 'lightClimate', 'soil', 'nutrition', 'phenology'],
        mode: 'bounded-dataset',
        catalogueSize: 2135,
      }),
      source({
        id: 'gbif',
        sections: ['distribution', 'seasonality'],
        mode: 'dynamic-occurrence',
      }),
      source({
        id: 'wikipedia',
        sections: ['phenology', 'propagation', 'usesEdibility', 'habitat', 'conservation'],
        mode: 'dynamic-local-article',
      }),
      source({
        id: 'plant-group-manual',
        sections: ['water', 'lightClimate', 'soil', 'nutrition', 'propagation', 'problems'],
        mode: 'group-guide',
        countsTowardExactDossier: false,
      }),
    ],
    limitations: [
      'USDA PLANTS is bounded and strongly North American; group guidance is not species evidence.',
      'Local Wikipedia articles are source-grounded but optional and do not guarantee every section for every species.',
    ],
  }),
  tree: category({
    sections: [
      'identityEvidence', 'safety', 'water', 'lightClimate', 'soil', 'nutrition',
      'phenology', 'fruiting', 'propagation', 'usesEdibility', 'habitat', 'distribution',
      'seasonality', 'problems', 'conservation',
    ],
    sources: [
      source({
        id: 'kindwise-plant',
        sections: ['identityEvidence', 'safety', 'usesEdibility', 'problems'],
        mode: 'dynamic-provider',
      }),
      source({
        id: 'usda-plants',
        sections: ['water', 'lightClimate', 'soil', 'nutrition', 'phenology'],
        mode: 'bounded-dataset',
        catalogueSize: 2135,
      }),
      source({
        id: 'gbif',
        sections: ['distribution', 'seasonality'],
        mode: 'dynamic-occurrence',
      }),
      source({
        id: 'wikipedia',
        sections: ['phenology', 'propagation', 'usesEdibility', 'habitat', 'conservation'],
        mode: 'dynamic-local-article',
      }),
      source({
        id: 'tree-group-manual',
        sections: [
          'water', 'lightClimate', 'soil', 'nutrition', 'phenology', 'fruiting', 'propagation', 'problems',
        ],
        mode: 'group-guide',
        countsTowardExactDossier: false,
      }),
    ],
    limitations: [
      'Fruit and fertilizer guidance require an exact species and production context; a tree label is insufficient.',
      'USDA PLANTS, group manuals and optional local Wikipedia sections are not worldwide species coverage.',
    ],
  }),
  crop: category({
    sections: [
      'identityEvidence', 'healthDiagnosis', 'phenology', 'soilClimate',
      'nutritionFertilization', 'irrigation', 'ipm', 'disease', 'harvestPostharvest',
      'cultivation', 'usesEdibility', 'habitat', 'conservation',
    ],
    sources: [
      source({
        id: 'kindwise-crop',
        sections: ['identityEvidence', 'healthDiagnosis', 'disease'],
        mode: 'dynamic-provider',
      }),
      source({
        id: 'crop-agronomy-registry',
        sections: [
          'phenology', 'soilClimate', 'nutritionFertilization', 'irrigation',
          'ipm', 'disease', 'harvestPostharvest',
        ],
        mode: 'bounded-exact-registry',
        catalogueSize: 28,
      }),
      source({
        id: 'gbif',
        sections: ['identityEvidence'],
        mode: 'dynamic-taxonomy',
      }),
      source({
        id: 'wikipedia',
        sections: ['phenology', 'cultivation', 'usesEdibility', 'habitat', 'conservation'],
        mode: 'dynamic-local-article',
      }),
    ],
    limitations: [
      'The agronomy registry records 28 exact crops, but many modules are planned or conditional rather than present.',
      'A recommendation without region, crop stage, soil analysis and production context is not a complete protocol.',
      'Local article sections add documented context, never a fertilizer or pesticide prescription.',
    ],
  }),
  mushroom: category({
    sections: [
      'identityEvidence', 'safetyLookalikes', 'substrateTrophicRole', 'habitat',
      'reproductionSpores', 'lifeCycle', 'distribution', 'seasonality', 'ecologicalRole', 'conservation',
    ],
    sources: [
      source({
        id: 'kindwise-mushroom',
        sections: ['identityEvidence', 'safetyLookalikes', 'habitat'],
        mode: 'dynamic-provider',
      }),
      source({
        id: 'curated-mushroom',
        sections: ['habitat', 'ecologicalRole'],
        mode: 'bounded-curation',
        catalogueSize: 10,
      }),
      source({
        id: 'gbif',
        sections: ['distribution', 'seasonality'],
        mode: 'dynamic-occurrence',
      }),
      source({
        id: 'wikipedia',
        sections: [
          'substrateTrophicRole', 'habitat', 'reproductionSpores', 'lifeCycle',
          'ecologicalRole', 'conservation',
        ],
        mode: 'dynamic-local-article',
      }),
    ],
    limitations: [
      'The ten curated fungi do not cover the product; exact local articles can fill only sections they document.',
      'Occurrence months are observations, not a fruiting guarantee.',
    ],
  }),
  insect: category({
    sections: [
      'identityEvidence', 'safety', 'feeding', 'habitat', 'reproduction', 'lifeCycle', 'behavior',
      'lifeStages', 'distribution', 'seasonality', 'ecologicalRelations',
      'plantAssociations', 'problems', 'ipm', 'conservation',
    ],
    sources: [
      source({
        id: 'kindwise-insect',
        sections: ['identityEvidence', 'safety'],
        mode: 'dynamic-provider',
      }),
      source({
        id: 'gbif',
        sections: ['identityEvidence', 'distribution', 'seasonality'],
        mode: 'dynamic-taxonomy-occurrence',
      }),
      source({
        id: 'wikidata',
        sections: ['feeding', 'habitat', 'reproduction', 'lifeCycle', 'conservation'],
        mode: 'dynamic-linked-data',
      }),
      source({
        id: 'wikipedia',
        sections: [
          'feeding', 'habitat', 'reproduction', 'lifeCycle', 'behavior',
          'ecologicalRelations', 'conservation',
        ],
        mode: 'dynamic-local-article',
      }),
      source({
        id: 'globi',
        sections: ['feeding', 'lifeStages', 'ecologicalRelations', 'plantAssociations'],
        mode: 'dynamic-interactions',
      }),
      source({
        id: 'ipm-dossier',
        sections: ['problems', 'ipm'],
        mode: 'bounded-insect-crop-pairs',
        catalogueSize: 9,
      }),
      source({
        id: 'curated-insect',
        sections: ['habitat', 'ecologicalRelations'],
        mode: 'bounded-curation',
        catalogueSize: 10,
      }),
      source({
        id: 'insect-lifecycle-registry',
        sections: ['lifeStages', 'problems'],
        mode: 'bounded-exact-registry',
        catalogueSize: 1,
      }),
    ],
    limitations: [
      'Dynamic sources are sparse and source-bound; local articles expose only documented sections.',
      'IPM is valid only for the exact insect and crop pair, never for the insect name alone.',
    ],
  }),
  fish: category({
    sections: [
      'identityEvidence', 'safety', 'environment', 'feeding', 'habitat', 'reproduction', 'behavior',
      'lifeCycle', 'distribution', 'seasonality', 'ecologicalRole', 'conservation',
    ],
    sources: [
      source({
        id: 'fishial',
        sections: ['identityEvidence'],
        mode: 'dynamic-provider',
      }),
      source({
        id: 'worms',
        sections: ['environment'],
        mode: 'dynamic-taxonomy',
      }),
      source({
        id: 'wikidata',
        sections: ['feeding', 'habitat', 'reproduction', 'lifeCycle', 'conservation'],
        mode: 'dynamic-linked-data',
      }),
      source({
        id: 'wikipedia',
        sections: [
          'feeding', 'habitat', 'reproduction', 'lifeCycle', 'behavior',
          'ecologicalRole', 'conservation',
        ],
        mode: 'dynamic-local-article',
      }),
      source({
        id: 'gbif',
        sections: ['distribution', 'seasonality'],
        mode: 'dynamic-occurrence',
      }),
      source({
        id: 'fish-safety',
        sections: ['safety'],
        mode: 'bounded-danger-curation',
        catalogueSize: 2,
      }),
      source({
        id: 'curated-fish',
        sections: ['feeding', 'habitat', 'ecologicalRole'],
        mode: 'bounded-curation',
        catalogueSize: 10,
      }),
    ],
    limitations: [
      'The curated fish catalogue has ten entries and explicit danger evidence for only two; unknown is not safe.',
      'WoRMS, Wikidata and local article facts are optional, so exact species can still have a partial dossier.',
    ],
  }),
  bird: category({
    sections: [
      'identityEvidence', 'feeding', 'habitat', 'behaviorMigration', 'behavior', 'migration', 'vocalization',
      'reproduction', 'lifeCycle', 'distribution', 'seasonality', 'ecologicalRole', 'conservation',
    ],
    sources: [
      source({
        id: 'bioclip-2',
        sections: ['identityEvidence'],
        mode: 'dynamic-provider',
      }),
      source({
        id: 'nyckel',
        sections: ['identityEvidence'],
        mode: 'dynamic-provider-fallback',
      }),
      source({
        id: 'gbif',
        sections: ['identityEvidence', 'distribution', 'seasonality'],
        mode: 'dynamic-taxonomy-occurrence',
      }),
      source({
        id: 'wikidata',
        sections: ['feeding', 'habitat', 'reproduction', 'lifeCycle', 'conservation'],
        mode: 'dynamic-linked-data',
      }),
      source({
        id: 'wikipedia',
        sections: [
          'feeding', 'habitat', 'behavior', 'migration', 'vocalization',
          'reproduction', 'lifeCycle', 'ecologicalRole', 'conservation',
        ],
        mode: 'dynamic-local-article',
      }),
      source({
        id: 'curated-bird',
        sections: ['habitat', 'behaviorMigration', 'vocalization', 'ecologicalRole'],
        mode: 'bounded-curation',
        catalogueSize: 10,
      }),
    ],
    limitations: [
      'Ten curated birds are not worldwide coverage; local articles expose behavior, migration or song only when documented.',
      'GBIF occurrence months do not prove migration or breeding season.',
    ],
  }),
  sound: category({
    sections: [
      'audioEvidence', 'sourceIdentity', 'acousticPattern', 'frequencyTiming',
      'habitatContext', 'behavior', 'migration', 'ecologicalRole', 'conservation',
      'distribution', 'seasonality',
    ],
    sources: [
      source({
        id: 'perch',
        sections: ['audioEvidence', 'sourceIdentity'],
        mode: 'dynamic-audio-model',
      }),
      source({
        id: 'curated-sound',
        sections: ['habitatContext', 'behavior'],
        mode: 'bounded-curation',
        catalogueSize: 10,
      }),
      source({
        id: 'gbif',
        sections: ['distribution', 'seasonality'],
        mode: 'dynamic-occurrence-after-exact-taxon',
      }),
      source({
        id: 'wikipedia',
        sections: [
          'acousticPattern', 'frequencyTiming', 'habitatContext', 'behavior',
          'migration', 'ecologicalRole', 'conservation',
        ],
        mode: 'dynamic-local-article',
      }),
    ],
    limitations: [
      'Ten curated sounds are not a dynamic acoustic dossier; local articles expose only documented patterns or timing.',
      'Distribution and seasonality apply only when the audio result carries an exact scientific identity.',
    ],
  }),
});

const CATEGORY_FIELDS = Object.freeze({
  fish: Object.freeze([
    { key: 'environment', field: 'environment', kind: 'truthyObject', all: ['worms'] },
    { key: 'feeding', field: 'diet', kind: 'list', all: ['worms', 'wikidata'] },
    { key: 'habitat', field: 'habitat', kind: 'list', all: ['worms', 'wikidata'] },
    { key: 'reproduction', field: 'reproduction', kind: 'list', all: ['worms', 'wikidata'] },
    { key: 'lifeCycle', field: 'lifeCycle', kind: 'list', all: ['worms', 'wikidata'] },
    { key: 'conservation', field: 'conservation', kind: 'object', all: ['worms', 'wikidata'] },
  ]),
  bird: Object.freeze([
    { key: 'feeding', field: 'diet', kind: 'list', all: ['gbif', 'wikidata'] },
    { key: 'habitat', field: 'habitat', kind: 'list', all: ['gbif', 'wikidata'] },
    { key: 'reproduction', field: 'reproduction', kind: 'list', all: ['gbif', 'wikidata'] },
    { key: 'lifeCycle', field: 'lifeCycle', kind: 'list', all: ['gbif', 'wikidata'] },
    { key: 'conservation', field: 'conservation', kind: 'object', all: ['gbif', 'wikidata'] },
  ]),
  insect: Object.freeze([
    { key: 'feeding', field: 'diet', kind: 'list', all: ['wikidata'] },
    { key: 'habitat', field: 'habitat', kind: 'list', all: ['wikidata'] },
    { key: 'reproduction', field: 'reproduction', kind: 'list', all: ['wikidata'] },
    { key: 'lifeCycle', field: 'lifeCycle', kind: 'list', all: ['wikidata'] },
    { key: 'conservation', field: 'conservation', kind: 'object', all: ['wikidata'] },
    {
      key: 'documentedFeeding',
      field: 'feeding',
      kind: 'list',
      all: ['globi'],
      oneOf: ['gbif', 'wikidata'],
    },
    {
      key: 'plantAssociations',
      field: 'plantAssociations',
      kind: 'list',
      all: ['globi'],
      oneOf: ['gbif', 'wikidata'],
    },
    {
      key: 'ecologicalRelations',
      field: 'ecologicalRelations',
      kind: 'list',
      all: ['globi'],
      oneOf: ['gbif', 'wikidata'],
    },
    {
      key: 'lifeStages',
      field: 'documentedLifeStages',
      kind: 'list',
      all: ['globi'],
      oneOf: ['gbif', 'wikidata'],
    },
  ]),
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanScientific(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().normalize('NFC');
  return /^\p{Lu}[\p{L}\p{M}.'\u2019-]{1,63} \p{Ll}[\p{L}\p{M}.'\u2019-]{1,63}$/u.test(clean)
    ? clean
    : null;
}

function validGlobiSource(source, expectedScientific) {
  if (source?.id !== 'globi' || source.license !== 'CC-BY-4.0') return false;
  try {
    const url = new URL(source.url);
    const keys = [...url.searchParams.keys()];
    return url.protocol === 'https:' &&
      url.hostname === 'globalbioticinteractions.org' &&
      url.pathname === '/' &&
      keys.length === 1 &&
      keys[0] === 'sourceTaxon' &&
      url.searchParams.get('sourceTaxon') === expectedScientific;
  } catch (error) {
    return false;
  }
}

function verifiedSourceIds(sources, expectedScientific) {
  const ids = new Set();
  if (!Array.isArray(sources)) return ids;
  for (const source of sources) {
    if (!isPlainObject(source) || typeof source.url !== 'string') continue;
    if (validGlobiSource(source, expectedScientific)) {
      ids.add('globi');
      continue;
    }
    const rule = SOURCE_RULES[source.id];
    if (rule && source.license === rule.license && rule.url.test(source.url.trim())) {
      ids.add(source.id);
    }
  }
  return ids;
}

function hasEvidence(value, kind) {
  if (kind === 'list') return Array.isArray(value) && value.length > 0;
  if (kind === 'truthyObject') {
    return isPlainObject(value) && Object.values(value).some((item) => item === true);
  }
  return isPlainObject(value) && Object.keys(value).length > 0;
}

const PLACEHOLDER_TEXTS = new Set([
  '-', '—', 'n/a', 'na', 'none', 'null', 'unknown', 'not available', 'no data',
  'sem dados', 'nao disponivel', 'não disponível', 'desconhecido', 'desconhecida',
]);
const UI_ONLY_KEYS = new Set(['key', 'icon', 'route', 'screen', 'title', 'label']);

function cleanEvidenceText(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ').normalize('NFC');
  if (!clean) return null;
  const folded = clean.toLocaleLowerCase('en-US');
  if (PLACEHOLDER_TEXTS.has(folded)) return null;
  if (/^[a-z][\w-]*(?:\.[\w-]+)+$/i.test(clean)) return null;
  return clean;
}

function hasConcreteEvidence(value, sectionKey = '') {
  if (typeof value === 'string') {
    const clean = cleanEvidenceText(value);
    return !!clean && clean.toLocaleLowerCase('en-US') !== String(sectionKey).toLocaleLowerCase('en-US');
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.some((item) => hasConcreteEvidence(item, sectionKey));
  if (!isPlainObject(value)) return false;

  const keys = Object.keys(value);
  if (!keys.length || keys.every((key) => UI_ONLY_KEYS.has(key))) return false;
  if ('id' in value && 'label' in value && cleanEvidenceText(value.label)) return true;
  return Object.entries(value).some(([key, item]) => (
    !UI_ONLY_KEYS.has(key) && key !== 'id' && hasConcreteEvidence(item, sectionKey)
  ));
}

function auditCategoryEvidence({ category: categoryKey, sections } = {}) {
  const contract = CATEGORY_DEPTH_MATRIX[categoryKey];
  if (!contract || !isPlainObject(sections)) return [];

  const sourcesById = new Map(contract.sources.map((item) => [item.id, item]));
  return contract.sections.flatMap((sectionKey) => {
    const record = sections[sectionKey];
    if (!isPlainObject(record) || !hasConcreteEvidence(record.value, sectionKey)) return [];
    const suppliedSourceIds = Array.isArray(record.sourceIds) ? record.sourceIds : [];
    const acceptedSourceIds = suppliedSourceIds.filter((sourceId, index) => {
      if (suppliedSourceIds.indexOf(sourceId) !== index) return false;
      const current = sourcesById.get(sourceId);
      return current?.countsTowardExactDossier === true && current.sections.includes(sectionKey);
    });
    if (!acceptedSourceIds.length) return [];
    return [{ key: sectionKey, evidence: record.value, sourceIds: acceptedSourceIds }];
  });
}

function buildCategoryDepthTopics({ category, scientific, dossier } = {}) {
  const expected = cleanScientific(scientific);
  const actual = cleanScientific(dossier?.scientific);
  const fields = CATEGORY_FIELDS[category];
  if (!expected || actual !== expected || !fields || !isPlainObject(dossier)) return [];

  const sourceIds = verifiedSourceIds(dossier.sources, expected);
  const topics = [];
  for (const rule of fields) {
    if (!hasEvidence(dossier[rule.field], rule.kind)) continue;
    if (!rule.all.every((id) => sourceIds.has(id))) continue;
    if (rule.oneOf && !rule.oneOf.some((id) => sourceIds.has(id))) continue;
    const boundSources = rule.all.concat(
      rule.oneOf ? [rule.oneOf.find((id) => sourceIds.has(id))] : []
    );
    topics.push({
      key: rule.key,
      scientific: expected,
      evidence: dossier[rule.field],
      sourceIds: boundSources,
    });
  }
  return topics;
}

module.exports = {
  CATEGORY_DEPTH_MATRIX,
  CATEGORY_FIELDS,
  MISSING_DATA_BEHAVIOUR,
  auditCategoryEvidence,
  buildCategoryDepthTopics,
  cleanScientific,
  hasConcreteEvidence,
  verifiedSourceIds,
};
