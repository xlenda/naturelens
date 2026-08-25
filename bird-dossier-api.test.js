const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BIRD_SOURCE_UNAVAILABLE,
  buildBirdIdentityQuery,
  buildBirdLabelQuery,
  clearBirdLabelCache,
  fetchBirdJson,
  loadBirdDossier,
  mapBirdLabelIdentity,
  mapConservation,
  resolveExactBirdLabel,
  selectExactGbifBird,
} = require('./api/_lib/birdDossier');

function jsonResponse(body, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(text.length) : null },
    text: async () => text,
  };
}

function binding(type, value, language) {
  const result = { type, value };
  if (language) result['xml:lang'] = language;
  return result;
}

function gbifBird(overrides = {}) {
  return {
    usageKey: 9510564,
    speciesKey: 9510564,
    scientificName: 'Turdus migratorius Linnaeus, 1766',
    canonicalName: 'Turdus migratorius',
    species: 'Turdus migratorius',
    rank: 'SPECIES',
    status: 'ACCEPTED',
    confidence: 99,
    matchType: 'EXACT',
    class: 'Aves',
    classKey: 212,
    ...overrides,
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

function quantityClaim(amount, unit, rank = 'normal') {
  return {
    rank,
    mainsnak: {
      snaktype: 'value',
      datavalue: {
        type: 'quantity',
        value: { amount: String(amount), unit },
      },
    },
  };
}

function birdIdentityPayload({ taxon = 'Q460967', scientific = 'Turdus migratorius', gbif = '9510564' } = {}) {
  return {
    results: {
      bindings: [{
        taxon: binding('uri', `http://www.wikidata.org/entity/${taxon}`),
        scientific: binding('literal', scientific),
        gbif: binding('literal', gbif),
      }],
    },
  };
}

test('bird queries require exact species identity and never request an English fallback', () => {
  const identity = buildBirdIdentityQuery('Turdus migratorius');
  assert.match(identity, /wdt:P225 "Turdus migratorius"/);
  assert.match(identity, /wdt:P105 wd:Q7432/);
  assert.match(identity, /wdt:P171\* wd:Q5113/);
  assert.match(identity, /LIMIT 3/);

  const label = buildBirdLabelQuery('American Robin');
  assert.match(label, /"American Robin"@en/);
  assert.match(label, /"american robin"@en/);
  assert.match(label, /rdfs:label|skos:altLabel/);
  assert.doesNotMatch(label, /CONTAINS|AUTO_LANGUAGE|wikibase:mwapi|fuzzy/i);
  assert.equal(buildBirdLabelQuery('bad\nlabel'), null);
});

test('GBIF proof accepts only an exact accepted species in Aves', () => {
  assert.deepEqual(selectExactGbifBird(gbifBird(), 'Turdus migratorius'), {
    usageKey: 9510564,
    scientific: 'Turdus migratorius',
  });
  for (const invalid of [
    { matchType: 'FUZZY' },
    { rank: 'GENUS' },
    { status: 'DOUBTFUL' },
    { class: 'Mammalia', classKey: 359 },
    { confidence: 89 },
    { canonicalName: 'Turdus rufiventris' },
    { speciesKey: 1 },
  ]) {
    assert.equal(selectExactGbifBird(gbifBird(invalid), 'Turdus migratorius'), null);
  }
});

test('common label bridge rejects ambiguity and conflicting GBIF identifiers', () => {
  assert.equal(mapBirdLabelIdentity(birdIdentityPayload()).scientific, 'Turdus migratorius');

  const ambiguous = birdIdentityPayload();
  ambiguous.results.bindings.push({
    taxon: binding('uri', 'http://www.wikidata.org/entity/Q999'),
    scientific: binding('literal', 'Turdus obscurus'),
    gbif: binding('literal', '2490714'),
  });
  assert.equal(mapBirdLabelIdentity(ambiguous), null);

  const conflict = birdIdentityPayload();
  conflict.results.bindings.push({
    taxon: binding('uri', 'http://www.wikidata.org/entity/Q460967'),
    scientific: binding('literal', 'Turdus migratorius'),
    gbif: binding('literal', '1'),
  });
  assert.equal(mapBirdLabelIdentity(conflict), null);
});

test('American Robin resolves beyond the ten curated birds and shares an in-flight cache', async () => {
  clearBirdLabelCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith('https://query.wikidata.org/')) return jsonResponse(birdIdentityPayload());
    if (url.startsWith('https://api.gbif.org/')) return jsonResponse(gbifBird());
    throw new Error(`unexpected url: ${url}`);
  };
  const [first, second] = await Promise.all([
    resolveExactBirdLabel('American Robin', { fetchImpl, timeoutMs: 100 }),
    resolveExactBirdLabel('American Robin', { fetchImpl, timeoutMs: 100 }),
  ]);
  const third = await resolveExactBirdLabel('American Robin', { fetchImpl, timeoutMs: 100 });
  assert.deepEqual(first, {
    scientific: 'Turdus migratorius',
    gbifKey: 9510564,
    wikidataId: 'Q460967',
  });
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
  assert.equal(calls.length, 2);
});

test('bird dossier maps direct facts, reproduction, life cycle and conservation', async () => {
  const calls = [];
  const claims = {
    P1034: [entityClaim('Q25349')],
    P2974: [entityClaim('Q179049')],
    P141: [entityClaim('Q219127')],
    P7725: [quantityClaim('+3', '1')],
    P7770: [quantityClaim('+13', 'http://www.wikidata.org/entity/Q573')],
    P2250: [quantityClaim('+2', 'http://www.wikidata.org/entity/Q577')],
    P4214: [quantityClaim('+14', 'http://www.wikidata.org/entity/Q577')],
  };
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith('https://api.gbif.org/')) return jsonResponse(gbifBird());
    if (url.startsWith('https://query.wikidata.org/')) {
      return jsonResponse({
        results: { bindings: [{
          taxon: binding('uri', 'http://www.wikidata.org/entity/Q460967'),
          gbif: binding('literal', '9510564'),
        }] },
      });
    }
    if (url.includes('props=claims')) {
      return jsonResponse({ entities: { Q460967: { claims } } });
    }
    if (url.includes('props=labels')) {
      return jsonResponse({
        entities: {
          Q25349: { labels: { pt: { language: 'pt', value: 'insetos' }, en: { language: 'en', value: 'insects' } } },
          Q179049: { labels: { pt: { language: 'pt', value: 'floresta temperada' } } },
        },
      });
    }
    throw new Error(`unexpected url: ${url}`);
  };

  const dossier = await loadBirdDossier({
    scientific: 'Turdus migratorius',
    language: 'pt',
  }, { fetchImpl, timeoutMs: 100 });

  assert.equal(dossier.scientific, 'Turdus migratorius');
  assert.deepEqual(dossier.diet, [{ id: 'Q25349', label: 'insetos' }]);
  assert.deepEqual(dossier.habitat, [{ id: 'Q179049', label: 'floresta temperada' }]);
  assert.deepEqual(dossier.reproduction, [
    { id: 'clutchSize', amount: 3, unit: 'count' },
    { id: 'incubationPeriod', amount: 13, unit: 'day' },
  ]);
  assert.deepEqual(dossier.lifeCycle, [
    { id: 'lifeExpectancy', amount: 2, unit: 'year' },
    { id: 'longestLifespan', amount: 14, unit: 'year' },
  ]);
  assert.deepEqual(dossier.conservation, { code: 'CR' });
  assert.deepEqual(dossier.sources.map((source) => source.id), ['gbif', 'wikidata']);
  assert.equal(calls.length, 4);
  assert.equal(calls[3].includes('languages=pt'), true);
  assert.equal(calls[3].includes('languagefallback=0'), true);
});

test('absent and uncertain claims remain absent instead of becoming invented ranges', async () => {
  assert.equal(mapConservation({ P141: [entityClaim('Q219127'), entityClaim('Q278113')] }), null);
  assert.equal(mapConservation({ P141: [entityClaim('Q999')] }), null);

  const fetchImpl = async (url) => {
    if (url.startsWith('https://api.gbif.org/')) return jsonResponse(gbifBird());
    if (url.startsWith('https://query.wikidata.org/')) return jsonResponse({
      results: { bindings: [{ taxon: binding('uri', 'http://www.wikidata.org/entity/Q460967') }] },
    });
    if (url.includes('props=claims')) return jsonResponse({ entities: { Q460967: { claims: {} } } });
    throw new Error(`unexpected url: ${url}`);
  };
  const dossier = await loadBirdDossier({
    scientific: 'Turdus migratorius',
    language: 'pt',
  }, { fetchImpl, timeoutMs: 100 });
  assert.deepEqual(dossier.diet, []);
  assert.deepEqual(dossier.habitat, []);
  assert.deepEqual(dossier.reproduction, []);
  assert.deepEqual(dossier.lifeCycle, []);
  assert.equal(dossier.conservation, null);
});

test('an invalid claims payload marks the otherwise exact bird dossier partial', async () => {
  const fetchImpl = async (url) => {
    if (url.startsWith('https://api.gbif.org/')) return jsonResponse(gbifBird());
    if (url.startsWith('https://query.wikidata.org/')) return jsonResponse({
      results: { bindings: [{
        taxon: binding('uri', 'http://www.wikidata.org/entity/Q460967'),
        gbif: binding('literal', '9510564'),
      }] },
    });
    if (url.includes('props=claims')) return jsonResponse({ entities: {} });
    throw new Error(`unexpected url: ${url}`);
  };
  const dossier = await loadBirdDossier({
    scientific: 'Turdus migratorius',
    language: 'pt',
  }, { fetchImpl, timeoutMs: 100 });
  assert.equal(dossier[BIRD_SOURCE_UNAVAILABLE], true);
});

test('bird upstream requests have a hard timeout', async () => {
  const never = () => new Promise(() => {});
  await assert.rejects(
    fetchBirdJson('https://api.gbif.org/v1/species/match', { fetchImpl: never, timeoutMs: 10 }),
    (error) => error?.kind === 'timeout'
  );
});
