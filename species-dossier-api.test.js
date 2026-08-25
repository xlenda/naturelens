const test = require('node:test');
const assert = require('node:assert/strict');

const dossierApi = require('./api/species-dossier');

const {
  MAX_CONCURRENT_DOSSIERS,
  acquireDossierSlot,
  buildAncestryAskQuery,
  buildWikidataQuery,
  dedupeSources,
  environmentFromWorms,
  exactWikidataClaims,
  fetchJson,
  isExactFishClassification,
  loadCategoryDossier,
  loadInvertebrateDossier,
  mapStructuredClaims,
  mapWikidataBindings,
  normaliseCategory,
  normaliseLanguage,
  normaliseScientificName,
  releaseDossierSlot,
  selectExactWormsRecord,
} = dossierApi;
const {
  GLOBI_INTERACTION_TYPES,
  gbifInvertebrateMatchUrl,
  globiInteractionUrl,
  mapGlobiInteractionPayload,
  selectExactGbifInvertebrate,
} = require('./api/_lib/insectDossier');

test('dynamic dossier concurrency is bounded even for cache-busting scientific names', () => {
  let acquired = 0;
  try {
    for (let index = 0; index < MAX_CONCURRENT_DOSSIERS; index += 1) {
      assert.equal(acquireDossierSlot(), true);
      acquired += 1;
    }
    assert.equal(acquireDossierSlot(), false);
  } finally {
    for (let index = 0; index < acquired; index += 1) releaseDossierSlot();
  }
  assert.equal(acquireDossierSlot(), true);
  releaseDossierSlot();
});

function jsonResponse(body, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(text.length) : null },
    text: async () => text,
  };
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function binding(type, value, language) {
  const item = { type, value };
  if (language) item['xml:lang'] = language;
  return item;
}

function wikidataPayload({
  taxon = 'Q1126155',
  worms = null,
  diet = [],
  habitat = [],
  extra = [],
} = {}) {
  const identity = {
    taxon: binding('uri', `http://www.wikidata.org/entity/${taxon}`),
    kind: binding('literal', 'identity'),
  };
  if (worms) identity.worms = binding('literal', String(worms));

  const rows = [identity];
  for (const [id, label, language = 'pt'] of diet) {
    rows.push({
      taxon: identity.taxon,
      worms: identity.worms,
      kind: binding('literal', 'diet'),
      value: binding('uri', `http://www.wikidata.org/entity/${id}`),
      valueLabel: binding('literal', label, language),
    });
  }
  for (const [id, label, language = 'pt'] of habitat) {
    rows.push({
      taxon: identity.taxon,
      worms: identity.worms,
      kind: binding('literal', 'habitat'),
      value: binding('uri', `http://www.wikidata.org/entity/${id}`),
      valueLabel: binding('literal', label, language),
    });
  }

  return { results: { bindings: [...rows, ...extra] } };
}

function quantityClaim(amount, unit, overrides = {}) {
  return {
    rank: 'normal',
    mainsnak: {
      snaktype: 'value',
      datavalue: {
        type: 'quantity',
        value: {
          amount: String(amount),
          unit,
          lowerBound: String(amount),
          upperBound: String(amount),
          ...overrides,
        },
      },
    },
  };
}

function entityClaim(id, rank = 'normal') {
  return {
    rank,
    mainsnak: {
      snaktype: 'value',
      datavalue: { type: 'wikibase-entityid', value: { id } },
    },
  };
}

function claimsPayload(wikidataId = 'Q1126155', claims = {}) {
  return { entities: { [wikidataId]: { id: wikidataId, claims } } };
}

function richClaims() {
  return {
    P7725: [quantityClaim('+120', '1')],
    P7770: [quantityClaim('+7', 'http://www.wikidata.org/entity/Q573')],
    P3063: [quantityClaim('+30', 'http://www.wikidata.org/entity/Q573')],
    P2250: [quantityClaim('+10', 'http://www.wikidata.org/entity/Q577')],
    P4214: [quantityClaim('+12', 'http://www.wikidata.org/entity/Q577')],
    P141: [entityClaim('Q211005')],
  };
}

function exactWormsRecord(overrides = {}) {
  return {
    AphiaID: 278400,
    scientificname: 'Amphiprion ocellaris',
    status: 'accepted',
    rank: 'Species',
    valid_AphiaID: 278400,
    valid_name: 'Amphiprion ocellaris',
    match_type: 'exact',
    isMarine: 1,
    isBrackish: 0,
    isFreshwater: 0,
    ...overrides,
  };
}

function exactGbifInvertebrate(scientific = 'Apis mellifera', overrides = {}) {
  return {
    usageKey: 1341976,
    canonicalName: scientific,
    scientificName: scientific,
    species: scientific,
    speciesKey: 1341976,
    rank: 'SPECIES',
    status: 'ACCEPTED',
    matchType: 'EXACT',
    confidence: 100,
    kingdom: 'Animalia',
    kingdomKey: 1,
    phylum: 'Arthropoda',
    class: 'Insecta',
    order: 'Hymenoptera',
    family: 'Apidae',
    genus: scientific.split(' ')[0],
    ...overrides,
  };
}

const GLOBI_COLUMNS = [
  'source_taxon_name',
  'source_specimen_life_stage',
  'interaction_type',
  'target_taxon_name',
  'target_taxon_external_id',
  'target_taxon_path',
];

function globiPayload(rows = []) {
  return { columns: GLOBI_COLUMNS, data: rows };
}

function fishClassification() {
  return {
    AphiaID: 1,
    scientificname: 'Biota',
    child: {
      AphiaID: 2,
      scientificname: 'Animalia',
      rank: 'Kingdom',
      child: {
        AphiaID: 3,
        scientificname: 'Actinopterygii',
        rank: 'Class',
        child: {
          AphiaID: 278400,
          scientificname: 'Amphiprion ocellaris',
          rank: 'Species',
          child: null,
        },
      },
    },
  };
}

function fishFetch({ classification = fishClassification(), wikidata } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/AphiaRecordsByName/')) return jsonResponse([exactWormsRecord()]);
    if (url.includes('/AphiaClassificationByAphiaID/')) return jsonResponse(classification);
    if (url.startsWith('https://www.wikidata.org/w/api.php')) {
      return jsonResponse(claimsPayload('Q1126155', richClaims()));
    }
    if (url.startsWith('https://query.wikidata.org/')) {
      return jsonResponse(wikidata || wikidataPayload({
        worms: 278400,
        diet: [
          ['Q171934', 'nectar'],
          ['Q171934', 'nectar'],
          ['Q79932', 'pollen', 'en'],
        ],
        habitat: [['Q123', 'recife de coral']],
      }));
    }
    throw new Error(`unexpected url: ${url}`);
  };
  return { calls, fetchImpl };
}

test('request values are canonicalised without an English fallback', () => {
  assert.equal(normaliseCategory(' FISH '), 'fish');
  assert.equal(normaliseCategory('bird'), 'bird');
  assert.equal(normaliseCategory(['fish']), null);

  assert.equal(normaliseLanguage('pt-BR'), 'pt');
  assert.equal(normaliseLanguage('zh_TW'), 'zh-hant');
  assert.equal(normaliseLanguage('zh-Hans'), 'zh');
  assert.equal(normaliseLanguage('ja'), null);
  assert.equal(normaliseLanguage(['pt']), null);

  assert.equal(normaliseScientificName(' Amphiprion ocellaris '), 'Amphiprion ocellaris');
  assert.equal(normaliseScientificName('amphiprion ocellaris'), null);
  assert.equal(normaliseScientificName('Amphiprion Ocellaris'), null);
  assert.equal(normaliseScientificName('Amphiprion ocellaris Cuvier'), null);
  assert.equal(normaliseScientificName('Amphiprion  ocellaris'), null);
  assert.equal(normaliseScientificName('Amphiprion ocellaris" } UNION { ?x ?y ?z'), null);
});

test('generic categories return only GBIF-proven exact species and local article sections', async () => {
  const previousFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.startsWith('https://api.gbif.org/')) {
      return jsonResponse({
        usageKey: 2895315,
        canonicalName: 'Coffea arabica',
        scientificName: 'Coffea arabica',
        species: 'Coffea arabica',
        speciesKey: 2895315,
        rank: 'SPECIES',
        status: 'ACCEPTED',
        matchType: 'EXACT',
        confidence: 100,
        kingdom: 'Plantae',
        family: 'Rubiaceae',
        genus: 'Coffea',
      });
    }
    if (url.startsWith('https://pt.wikipedia.org/w/api.php')) {
      return jsonResponse({
        query: {
          pages: [{
            title: 'CafÃ©',
            fullurl: 'https://pt.wikipedia.org/wiki/Coffea_arabica',
            extract: [
              'Coffea arabica Ã© uma espÃ©cie vegetal cultivada.',
              '== Cultivo ==',
              'A cultura Ã© documentada em regiÃµes de altitude elevada e clima ameno.',
            ].join('\n'),
          }],
        },
      });
    }
    throw new Error(`unexpected url: ${url}`);
  };
  const res = responseRecorder();
  try {
    await dossierApi({
      method: 'GET',
      query: {
        category: 'crop',
        scientificName: 'Coffea arabica',
        language: 'pt-BR',
        wiki: '1',
      },
    }, res);
  } finally {
    global.fetch = previousFetch;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.scientific, 'Coffea arabica');
  assert.equal(res.body.taxonomy.family, 'Rubiaceae');
  assert.deepEqual(res.body.wikiSections.map((section) => section.key), ['cultivation']);
  assert.deepEqual(res.body.sources.map((source) => source.id), ['gbif', 'wikipedia']);
  assert.equal(res.body.partial, false);
  assert.equal(calls.length, 2);
});

test('fauna dossiers can append a same-species local article without replacing base proof', async () => {
  const fake = fishFetch();
  const fetchImpl = async (url, options) => {
    if (url.startsWith('https://pt.wikipedia.org/w/api.php')) {
      return jsonResponse({
        query: {
          pages: [{
            title: 'Peixe-palhaÃ§o-comum',
            fullurl: 'https://pt.wikipedia.org/wiki/Amphiprion_ocellaris',
            extract: [
              'Amphiprion ocellaris Ã© uma espÃ©cie de peixe marinho.',
              '== Comportamento ==',
              'A espÃ©cie vive associada a anÃªmonas e apresenta comportamento territorial documentado.',
            ].join('\n'),
          }],
        },
      });
    }
    return fake.fetchImpl(url, options);
  };
  const dossier = await loadCategoryDossier({
    category: 'fish',
    scientific: 'Amphiprion ocellaris',
    language: 'pt',
    includeWiki: true,
  }, { fetchImpl, timeoutMs: 100 });

  assert.equal(dossier.taxonomy.sourceId, 'worms');
  assert.deepEqual(dossier.wikiSections.map((section) => section.key), ['behavior']);
  assert.deepEqual(dossier.sources.map((source) => source.id), ['worms', 'wikidata', 'wikipedia']);
});

test('a local article never erases an inherited partial-source state', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/AphiaRecordsByName/')) return jsonResponse([exactWormsRecord()]);
    if (url.includes('/AphiaClassificationByAphiaID/')) return jsonResponse(fishClassification());
    if (url.startsWith('https://query.wikidata.org/')) throw new Error('wikidata unavailable');
    if (url.startsWith('https://pt.wikipedia.org/w/api.php')) {
      return jsonResponse({
        query: {
          pages: [{
            title: 'Peixe-palhaÃ§o-comum',
            fullurl: 'https://pt.wikipedia.org/wiki/Amphiprion_ocellaris',
            extract: [
              'Amphiprion ocellaris Ã© uma espÃ©cie de peixe marinho.',
              '== Habitat ==',
              'A espÃ©cie ocorre em recifes rasos associada a anÃªmonas hospedeiras.',
            ].join('\n'),
          }],
        },
      });
    }
    throw new Error(`unexpected url: ${url}`);
  };
  const dossier = await loadCategoryDossier({
    category: 'fish',
    scientific: 'Amphiprion ocellaris',
    language: 'pt',
    includeWiki: true,
  }, { fetchImpl, timeoutMs: 100 });

  assert.equal(dossier.partial, true);
  assert.deepEqual(dossier.wikiSections.map((section) => section.key), ['habitat']);
  assert.deepEqual(dossier.sources.map((source) => source.id), ['worms', 'wikipedia']);
});

test('invertebrate enrichment is dynamic by exact scientific name and never a local catalog', () => {
  const scientific = 'Danaus plexippus';
  assert.match(gbifInvertebrateMatchUrl(scientific), /api\.gbif\.org\/v1\/species\/match/);
  assert.match(gbifInvertebrateMatchUrl(scientific), /name=Danaus\+plexippus/);
  for (const relation of GLOBI_INTERACTION_TYPES) {
    const url = new URL(globiInteractionUrl(scientific, relation));
    assert.equal(url.searchParams.get('sourceTaxon'), scientific);
    assert.equal(url.searchParams.get('interactionType'), relation);
    assert.equal(url.searchParams.get('type'), 'json');
  }
});

test('GBIF proof accepts an exact invertebrate and rejects vertebrates or weak matches', () => {
  const exact = exactGbifInvertebrate('Danaus plexippus');
  assert.deepEqual(selectExactGbifInvertebrate(exact, 'Danaus plexippus'), {
    usageKey: 1341976,
    scientific: 'Danaus plexippus',
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    className: 'Insecta',
    order: 'Hymenoptera',
    family: 'Apidae',
    genus: 'Danaus',
  });
  assert.equal(selectExactGbifInvertebrate({ ...exact, phylum: 'Chordata' }, 'Danaus plexippus'), null);
  assert.equal(selectExactGbifInvertebrate({ ...exact, matchType: 'FUZZY' }, 'Danaus plexippus'), null);
  assert.equal(selectExactGbifInvertebrate({ ...exact, confidence: 94 }, 'Danaus plexippus'), null);
  assert.equal(selectExactGbifInvertebrate({ ...exact, canonicalName: 'Danaus gilippus' }, 'Danaus plexippus'), null);
});

test('GloBI mapper keeps only exact source rows, taxon ids and documented plant relations', () => {
  const mapped = mapGlobiInteractionPayload(globiPayload([
    [
      'Spodoptera frugiperda',
      'larva',
      'eats',
      'Zea mays',
      'GBIF:5290052',
      'Eukaryota | Plantae | Tracheophyta | Poaceae | Zea | Zea mays',
    ],
    [
      'Spodoptera frugiperda',
      'larva',
      'eats',
      'unresolved corn',
      'no:match',
      null,
    ],
    [
      'Spodoptera frugiperda',
      'larva',
      'eats',
      'Johnson',
      'GBIF:6784701',
      'Plantae | Chlorophyta | Johnson',
    ],
    [
      'Spodoptera exigua',
      'larva',
      'eats',
      'Glycine max',
      'GBIF:2891130',
      'Plantae | Fabaceae | Glycine max',
    ],
  ]), 'Spodoptera frugiperda', 'eats');

  assert.deepEqual(mapped.feeding, [{
    id: 'eats:GBIF:5290052',
    name: 'Zea mays',
    relation: 'eats',
  }]);
  assert.deepEqual(mapped.plantAssociations, mapped.feeding);
  assert.deepEqual(mapped.ecologicalRelations, []);
  assert.deepEqual(mapped.lifeStages, ['larva']);

  const stageWithoutUsableTarget = mapGlobiInteractionPayload(globiPayload([[
    'Spodoptera frugiperda',
    'pupa',
    'eats',
    'unresolved target',
    'no:match',
    null,
  ]]), 'Spodoptera frugiperda', 'eats');
  assert.deepEqual(stageWithoutUsableTarget.feeding, []);
  assert.deepEqual(stageWithoutUsableTarget.lifeStages, ['pupa']);
});

test('the SPARQL contract asks only for exact identity, habitat and diet', () => {
  const query = buildWikidataQuery({
    scientific: 'Amphiprion ocellaris',
    category: 'fish',
    language: 'pt',
    aphiaId: 278400,
  });

  assert.match(query, /wdt:P225 "Amphiprion ocellaris"/);
  assert.match(query, /wdt:P105 wd:Q7432/);
  assert.match(query, /wdt:P850 "278400"/);
  assert.match(query, /wdt:P2974/);
  assert.match(query, /wdt:P1034/);
  assert.match(query, /FILTER\(LANG\(\?valueLabel\) = "pt"\)/);
  assert.match(query, /LIMIT 24/);
  assert.doesNotMatch(query, /AUTO_LANGUAGE|,en|P141|conservation|safety|aquarium/i);

  const proof = buildAncestryAskQuery('Q30034', 'Q729');
  assert.match(proof, /VALUES \?taxon \{ wd:Q30034 \}/);
  assert.match(proof, /wdt:P171\* wd:Q729/);
  assert.equal(buildAncestryAskQuery('Q30034 } UNION {', 'Q729'), null);
});

test('WoRMS selection rejects synonyms, ambiguity and non-exact records', () => {
  const exact = exactWormsRecord();
  assert.equal(selectExactWormsRecord([exact], 'Amphiprion ocellaris'), exact);
  assert.equal(
    selectExactWormsRecord([exactWormsRecord({ status: 'unaccepted' })], 'Amphiprion ocellaris'),
    null
  );
  assert.equal(
    selectExactWormsRecord([
      exact,
      exactWormsRecord({ AphiaID: 99, valid_AphiaID: 99 }),
    ], 'Amphiprion ocellaris'),
    null
  );
  assert.equal(
    selectExactWormsRecord([
      exactWormsRecord({ valid_name: 'Amphiprion percula', valid_AphiaID: 99 }),
    ], 'Amphiprion ocellaris'),
    null
  );
});

test('fish proof requires the exact leaf and an explicit fish ancestor', () => {
  assert.equal(isExactFishClassification(fishClassification(), 'Amphiprion ocellaris', 278400), true);
  assert.equal(isExactFishClassification(fishClassification(), 'Amphiprion percula', 278400), false);
  assert.equal(isExactFishClassification(fishClassification(), 'Amphiprion ocellaris', 99), false);
  assert.equal(
    isExactFishClassification({
      AphiaID: 2,
      scientificname: 'Animalia',
      child: { AphiaID: 278400, scientificname: 'Amphiprion ocellaris' },
    }, 'Amphiprion ocellaris', 278400),
    false
  );
});

test('Wikidata mapper filters language and malformed rows, then deduplicates facts', () => {
  const payload = wikidataPayload({
    worms: 278400,
    diet: [
      ['Q2', 'zooplancton'],
      ['Q2', 'zooplancton'],
      ['Q3', 'plankton', 'en'],
    ],
    habitat: [['Q4', 'recife']],
    extra: [{
      taxon: binding('uri', 'http://www.wikidata.org/entity/Q1126155'),
      worms: binding('literal', '278400'),
      kind: binding('literal', 'diet'),
      value: binding('uri', 'https://attacker.test/Q5'),
      valueLabel: binding('literal', 'invalido', 'pt'),
    }],
  });
  const mapped = mapWikidataBindings(payload, {
    category: 'fish',
    language: 'pt',
    aphiaId: 278400,
  });

  assert.equal(mapped.wikidataId, 'Q1126155');
  assert.deepEqual(mapped.diet, [{ id: 'Q2', label: 'zooplancton' }]);
  assert.deepEqual(mapped.habitat, [{ id: 'Q4', label: 'recife' }]);
  assert.equal(
    mapWikidataBindings(payload, { category: 'fish', language: 'pt', aphiaId: 1 }),
    null
  );

  const ambiguous = structuredClone(payload);
  ambiguous.results.bindings.push({
    taxon: binding('uri', 'http://www.wikidata.org/entity/Q999'),
    kind: binding('literal', 'identity'),
  });
  assert.equal(
    mapWikidataBindings(ambiguous, { category: 'fish', language: 'pt', aphiaId: 278400 }),
    null
  );
});

test('environment preserves known false values and leaves unknown values null', () => {
  assert.deepEqual(environmentFromWorms({ isMarine: 1, isBrackish: 0 }), {
    marine: true,
    brackish: false,
    freshwater: null,
  });
  assert.equal(environmentFromWorms({}), null);
});

test('sources are deduplicated without merging licenses', () => {
  assert.deepEqual(dedupeSources([
    { id: 'wikidata', url: 'one', license: 'CC0-1.0' },
    { id: 'wikidata', url: 'two', license: 'other' },
  ]), [{ id: 'wikidata', url: 'one', license: 'CC0-1.0' }]);
});

test('fish handler returns the source-bound dynamic dossier and cache metadata', async () => {
  const previousFetch = global.fetch;
  const fake = fishFetch();
  global.fetch = fake.fetchImpl;
  const res = responseRecorder();

  try {
    await dossierApi({
      method: 'GET',
      query: {
        category: 'fish',
        scientificName: 'Amphiprion ocellaris',
        language: 'pt-BR',
      },
    }, res);
  } finally {
    global.fetch = previousFetch;
  }

  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body), [
    'scientific',
    'taxonomy',
    'environment',
    'diet',
    'habitat',
    'lifeCycle',
    'reproduction',
    'conservation',
    'sources',
    'partial',
  ]);
  assert.equal(res.body.scientific, 'Amphiprion ocellaris');
  assert.deepEqual(res.body.taxonomy, {
    sourceId: 'worms',
    species: 'Amphiprion ocellaris',
    kingdom: 'Animalia',
    className: 'Actinopterygii',
  });
  assert.deepEqual(res.body.environment, { marine: true, brackish: false, freshwater: false });
  assert.deepEqual(res.body.diet, [{ id: 'Q171934', label: 'nectar' }]);
  assert.deepEqual(res.body.habitat, [{ id: 'Q123', label: 'recife de coral' }]);
  assert.deepEqual(res.body.reproduction, [
    { id: 'clutchSize', amount: 120, unit: 'count' },
    { id: 'incubationPeriod', amount: 7, unit: 'day' },
    { id: 'gestationPeriod', amount: 30, unit: 'day' },
  ]);
  assert.deepEqual(res.body.lifeCycle, [
    { id: 'lifeExpectancy', amount: 10, unit: 'year' },
    { id: 'longestLifespan', amount: 12, unit: 'year' },
  ]);
  assert.deepEqual(res.body.conservation, { code: 'LC' });
  assert.deepEqual(res.body.sources.map((source) => source.id), ['worms', 'wikidata']);
  assert.equal(res.body.partial, false);
  assert.match(res.headers['cache-control'], /s-maxage=86400/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(fake.calls.length, 4);
});

test('verified WoRMS environment survives an unavailable Wikidata enrichment', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/AphiaRecordsByName/')) return jsonResponse([exactWormsRecord()]);
    if (url.includes('/AphiaClassificationByAphiaID/')) return jsonResponse(fishClassification());
    if (url.startsWith('https://query.wikidata.org/')) throw new Error('wikidata unavailable');
    throw new Error(`unexpected url: ${url}`);
  };

  const dossier = await dossierApi.loadFishDossier({
    scientific: 'Amphiprion ocellaris',
    language: 'pt',
  }, { fetchImpl, timeoutMs: 100 });

  assert.deepEqual(Object.keys(dossier), [
    'scientific',
    'taxonomy',
    'environment',
    'diet',
    'habitat',
    'lifeCycle',
    'reproduction',
    'conservation',
    'sources',
  ]);
  assert.deepEqual(dossier.environment, { marine: true, brackish: false, freshwater: false });
  assert.deepEqual(dossier.diet, []);
  assert.deepEqual(dossier.habitat, []);
  assert.deepEqual(dossier.lifeCycle, []);
  assert.deepEqual(dossier.reproduction, []);
  assert.equal(dossier.conservation, null);
  assert.deepEqual(dossier.sources.map((source) => source.id), ['worms']);
});

test('invertebrate dossier proves Animalia and rejects Chordata without WoRMS', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith('https://api.gbif.org/')) {
      return jsonResponse(exactGbifInvertebrate('Apis mellifera'));
    }
    if (url.startsWith('https://api.globalbioticinteractions.org/')) {
      return jsonResponse(globiPayload());
    }
    if (url.startsWith('https://www.wikidata.org/w/api.php')) {
      return jsonResponse(claimsPayload('Q30034', richClaims()));
    }
    const query = new URL(url).searchParams.get('query');
    if (query.includes('ASK') && query.includes('wd:Q729')) return jsonResponse({ boolean: true });
    if (query.includes('ASK') && query.includes('wd:Q10915')) return jsonResponse({ boolean: false });
    return jsonResponse(wikidataPayload({
      taxon: 'Q30034',
      diet: [['Q171934', 'nectar']],
    }));
  };

  const dossier = await loadInvertebrateDossier({
    scientific: 'Apis mellifera',
    language: 'pt',
  }, { fetchImpl, timeoutMs: 100 });

  assert.equal(dossier.scientific, 'Apis mellifera');
  assert.equal(dossier.environment, null);
  assert.deepEqual(dossier.diet, [{ id: 'Q171934', label: 'nectar' }]);
  assert.deepEqual(dossier.reproduction, [
    { id: 'clutchSize', amount: 120, unit: 'count' },
    { id: 'incubationPeriod', amount: 7, unit: 'day' },
    { id: 'gestationPeriod', amount: 30, unit: 'day' },
  ]);
  assert.deepEqual(dossier.conservation, { code: 'LC' });
  assert.deepEqual(dossier.sources.map((source) => source.id), ['gbif', 'wikidata']);
  assert.equal(calls.filter((url) => url.startsWith('https://api.globalbioticinteractions.org/')).length, 8);
  assert.equal(calls.some((url) => url.includes('marinespecies.org')), false);

  const chordateFetch = async (url) => {
    if (url.startsWith('https://api.gbif.org/')) {
      return jsonResponse(exactGbifInvertebrate('Carcharodon carcharias', {
        phylum: 'Chordata',
        class: 'Chondrichthyes',
      }));
    }
    if (url.startsWith('https://api.globalbioticinteractions.org/')) {
      return jsonResponse(globiPayload());
    }
    const query = new URL(url).searchParams.get('query');
    if (query.includes('ASK') && query.includes('wd:Q729')) return jsonResponse({ boolean: true });
    if (query.includes('ASK') && query.includes('wd:Q10915')) return jsonResponse({ boolean: true });
    return jsonResponse(wikidataPayload({ taxon: 'Q129026', diet: [['Q152', 'peixe']] }));
  };
  assert.equal(await loadInvertebrateDossier({
    scientific: 'Carcharodon carcharias',
    language: 'pt',
  }, { fetchImpl: chordateFetch, timeoutMs: 100 }), null);
});

test('invertebrate dossier adds source-bound food, host plants, roles and observed stages', async () => {
  const scientific = 'Danaus plexippus';
  const fetchImpl = async (url) => {
    if (url.startsWith('https://api.gbif.org/')) {
      return jsonResponse(exactGbifInvertebrate(scientific));
    }
    if (url.startsWith('https://api.globalbioticinteractions.org/')) {
      const relation = new URL(url).searchParams.get('interactionType');
      if (relation === 'eats') {
        return jsonResponse(globiPayload([[
          scientific,
          'larva',
          relation,
          'Asclepias curassavica',
          'GBIF:3170240',
          'Eukaryota | Plantae | Tracheophyta | Apocynaceae | Asclepias curassavica',
        ]]));
      }
      if (relation === 'pollinates') {
        return jsonResponse(globiPayload([[
          scientific,
          'adult',
          relation,
          'Lantana camara',
          'GBIF:5424063',
          'Eukaryota | Plantae | Tracheophyta | Verbenaceae | Lantana camara',
        ]]));
      }
      return jsonResponse(globiPayload());
    }
    if (url.startsWith('https://www.wikidata.org/w/api.php')) {
      return jsonResponse(claimsPayload('Q30034', {}));
    }
    return jsonResponse(wikidataPayload({ taxon: 'Q30034' }));
  };

  const dossier = await loadInvertebrateDossier({ scientific, language: 'pt' }, {
    fetchImpl,
    timeoutMs: 100,
  });

  assert.deepEqual(dossier.feeding, [{
    id: 'eats:GBIF:3170240',
    name: 'Asclepias curassavica',
    relation: 'eats',
  }]);
  assert.deepEqual(dossier.plantAssociations.map((fact) => fact.name), [
    'Asclepias curassavica',
    'Lantana camara',
  ]);
  assert.deepEqual(dossier.ecologicalRelations.map((fact) => fact.relation), ['pollinates']);
  assert.deepEqual(dossier.documentedLifeStages, ['larva', 'adult']);
  assert.deepEqual(dossier.sources.map((source) => source.id), ['gbif', 'wikidata', 'globi']);
});

test('exact GBIF identity returns partial taxonomy instead of a cached false 404', async () => {
  const previousFetch = global.fetch;
  const scientific = 'Anticarsia gemmatalis';
  global.fetch = async (url) => {
    if (url.startsWith('https://api.gbif.org/')) {
      return jsonResponse(exactGbifInvertebrate(scientific, {
        usageKey: 1777942,
        speciesKey: 1777942,
        order: 'Lepidoptera',
        family: 'Erebidae',
        genus: 'Anticarsia',
      }));
    }
    if (url.startsWith('https://api.globalbioticinteractions.org/')) {
      return jsonResponse(globiPayload());
    }
    if (url.startsWith('https://query.wikidata.org/')) {
      return jsonResponse({ results: { bindings: [] } });
    }
    throw new Error(`unexpected url: ${url}`);
  };
  const res = responseRecorder();

  try {
    await dossierApi({
      method: 'GET',
      query: { category: 'insect', scientificName: scientific, language: 'pt' },
    }, res);
  } finally {
    global.fetch = previousFetch;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.partial, true);
  assert.deepEqual(res.body.taxonomy, {
    sourceId: 'gbif',
    species: scientific,
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    className: 'Insecta',
    order: 'Lepidoptera',
    family: 'Erebidae',
    genus: 'Anticarsia',
  });
  assert.deepEqual(res.body.sources.map((source) => source.id), ['gbif']);
  assert.deepEqual(res.body.feeding, []);
  assert.match(res.headers['cache-control'], /s-maxage=300/);
  assert.notDeepEqual(res.body, { error: 'species_not_verified' });
});

test('exact GBIF identity stays verified during Wikidata and GloBI outages', async () => {
  const previousFetch = global.fetch;
  const scientific = 'Anticarsia gemmatalis';
  global.fetch = async (url) => {
    if (url.startsWith('https://api.gbif.org/')) {
      return jsonResponse(exactGbifInvertebrate(scientific, {
        usageKey: 1777942,
        speciesKey: 1777942,
        order: 'Lepidoptera',
        family: 'Erebidae',
        genus: 'Anticarsia',
      }));
    }
    throw new Error('editorial source unavailable');
  };
  const res = responseRecorder();

  try {
    await dossierApi({
      method: 'GET',
      query: { category: 'insect', scientificName: scientific, language: 'pt' },
    }, res);
  } finally {
    global.fetch = previousFetch;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.partial, true);
  assert.equal(res.body.taxonomy.order, 'Lepidoptera');
  assert.deepEqual(res.body.sources.map((source) => source.id), ['gbif']);
  assert.match(res.headers['cache-control'], /s-maxage=300/);
});

test('exact WoRMS fish identity also survives an empty editorial enrichment', async () => {
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('/AphiaRecordsByName/')) {
      return jsonResponse([exactWormsRecord({
        isMarine: null,
        isBrackish: null,
        isFreshwater: null,
      })]);
    }
    if (url.includes('/AphiaClassificationByAphiaID/')) {
      return jsonResponse(fishClassification());
    }
    if (url.startsWith('https://query.wikidata.org/')) {
      return jsonResponse({ results: { bindings: [] } });
    }
    throw new Error(`unexpected url: ${url}`);
  };
  const res = responseRecorder();

  try {
    await dossierApi({
      method: 'GET',
      query: { category: 'fish', scientificName: 'Amphiprion ocellaris', language: 'pt' },
    }, res);
  } finally {
    global.fetch = previousFetch;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.partial, true);
  assert.equal(res.body.environment, null);
  assert.equal(res.body.taxonomy.sourceId, 'worms');
  assert.equal(res.body.taxonomy.species, 'Amphiprion ocellaris');
  assert.deepEqual(res.body.sources.map((source) => source.id), ['worms']);
  assert.match(res.headers['cache-control'], /s-maxage=300/);
});

test('Wikidata ancestry preserves verified insect facts during a GBIF outage', async () => {
  const fetchImpl = async (url) => {
    if (url.startsWith('https://api.gbif.org/')) throw new Error('GBIF offline');
    if (url.startsWith('https://api.globalbioticinteractions.org/')) {
      return jsonResponse(globiPayload());
    }
    if (url.startsWith('https://www.wikidata.org/w/api.php')) {
      return jsonResponse(claimsPayload('Q30034', {}));
    }
    const query = new URL(url).searchParams.get('query');
    if (query.includes('ASK') && query.includes('wd:Q729')) return jsonResponse({ boolean: true });
    if (query.includes('ASK') && query.includes('wd:Q10915')) return jsonResponse({ boolean: false });
    return jsonResponse(wikidataPayload({
      taxon: 'Q30034',
      habitat: [['Q756', 'colmeia']],
    }));
  };

  const dossier = await loadInvertebrateDossier({
    scientific: 'Apis mellifera',
    language: 'pt',
  }, { fetchImpl, timeoutMs: 100 });
  assert.deepEqual(dossier.habitat, [{ id: 'Q756', label: 'colmeia' }]);
  assert.deepEqual(dossier.sources.map((source) => source.id), ['wikidata']);
});

test('structured claims keep only exact quantities, allowed units and strict IUCN codes', () => {
  const claims = richClaims();
  claims.P7770.push(
    quantityClaim('+2', 'http://www.wikidata.org/entity/Q577'),
    quantityClaim('+8', 'http://www.wikidata.org/entity/Q573', { lowerBound: '+6' })
  );
  claims.P3063.push(quantityClaim('+4', 'http://www.wikidata.org/entity/Q25235'));
  claims.P2250.push(quantityClaim('+0', 'http://www.wikidata.org/entity/Q577'));
  const mapped = mapStructuredClaims(claims);

  assert.deepEqual(mapped.reproduction, [
    { id: 'clutchSize', amount: 120, unit: 'count' },
    { id: 'incubationPeriod', amount: 7, unit: 'day' },
    { id: 'gestationPeriod', amount: 30, unit: 'day' },
  ]);
  assert.deepEqual(mapped.lifeCycle, [
    { id: 'lifeExpectancy', amount: 10, unit: 'year' },
    { id: 'longestLifespan', amount: 12, unit: 'year' },
  ]);
  assert.deepEqual(mapped.conservation, { code: 'LC' });

  assert.equal(exactWikidataClaims(claimsPayload('Q30034', claims), 'Q30034'), claims);
  assert.equal(exactWikidataClaims(claimsPayload('Q30034', claims), 'Q999'), null);
  assert.equal(mapStructuredClaims({ P141: [entityClaim('Q211005'), entityClaim('Q278113')] }).conservation, null);
});

test('claims failure keeps proven fish facts and marks the response as partial', async () => {
  const previousFetch = global.fetch;
  const fake = fishFetch();
  global.fetch = async (url, options) => {
    if (url.startsWith('https://www.wikidata.org/w/api.php')) {
      throw new Error('claims unavailable');
    }
    return fake.fetchImpl(url, options);
  };
  const res = responseRecorder();
  try {
    await dossierApi({
      method: 'GET',
      query: {
        category: 'fish',
        scientificName: 'Amphiprion ocellaris',
        language: 'pt',
      },
    }, res);
  } finally {
    global.fetch = previousFetch;
  }

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.diet, [{ id: 'Q171934', label: 'nectar' }]);
  assert.deepEqual(res.body.habitat, [{ id: 'Q123', label: 'recife de coral' }]);
  assert.deepEqual(res.body.reproduction, []);
  assert.deepEqual(res.body.lifeCycle, []);
  assert.equal(res.body.conservation, null);
  assert.equal(res.body.partial, true);
  assert.match(res.headers['cache-control'], /s-maxage=300/);
});

test('invalid requests never reach an upstream and non-GET is closed', async () => {
  const previousFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    throw new Error('must not fetch');
  };

  try {
    const bad = responseRecorder();
    await dossierApi({
      method: 'GET',
      query: { category: 'fish', scientificName: ['Amphiprion ocellaris'], language: 'pt' },
    }, bad);
    assert.equal(bad.statusCode, 400);
    assert.deepEqual(bad.body, { error: 'invalid_request' });
    assert.equal(bad.headers['cache-control'], 'private, no-store');

    const method = responseRecorder();
    await dossierApi({ method: 'POST', query: {} }, method);
    assert.equal(method.statusCode, 405);
    assert.equal(method.headers.allow, 'GET');
    assert.equal(calls, 0);
  } finally {
    global.fetch = previousFetch;
  }
});

test('category mismatch returns a short cached 404 with no dossier facts', async () => {
  const previousFetch = global.fetch;
  const fake = fishFetch({
    classification: {
      AphiaID: 1,
      scientificname: 'Animalia',
      child: { AphiaID: 278400, scientificname: 'Amphiprion ocellaris' },
    },
  });
  global.fetch = fake.fetchImpl;
  const res = responseRecorder();

  try {
    await dossierApi({
      method: 'GET',
      query: { category: 'fish', scientificName: 'Amphiprion ocellaris', language: 'pt' },
    }, res);
  } finally {
    global.fetch = previousFetch;
  }

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'species_not_verified' });
  assert.match(res.headers['cache-control'], /s-maxage=300/);
  assert.equal('diet' in res.body, false);
  assert.equal(fake.calls.some((url) => url.startsWith('https://www.wikidata.org/w/api.php')), false);
});

test('upstream requests have a hard timeout even when fetch ignores abort', async () => {
  const never = () => new Promise(() => {});
  await assert.rejects(
    fetchJson('https://query.wikidata.org/sparql', { fetchImpl: never, timeoutMs: 10 }),
    (error) => error?.kind === 'timeout'
  );
});
