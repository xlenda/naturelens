const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  buildIdentityV1,
  enrichmentTaxon,
  exactTaxon,
} = require('./components/taxonIdentity');
const { sanitiseEntry } = require('./api/collection');

const IDENTIFY_FILE = path.join(__dirname, 'api', 'identify.js');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadIdentifyHarness() {
  const fixtures = { fishial: [], nyckel: [], birdResolver: [] };
  const moduleRecord = { exports: {} };
  const nextFixture = (provider) => async () => fixtures[provider].shift();
  const dependencies = {
    './_lib/kindwise': { kindwiseIdentify: async () => null, requireMethod: () => true },
    './_lib/fishial': { fishialIdentify: nextFixture('fishial') },
    './_lib/nyckel': { nyckelIdentify: nextFixture('nyckel') },
    './_lib/bioclipBird': {
      bioclipBirdIdentify: async () => null,
      isBioClipConfigured: () => false,
    },
    './_lib/birdDossier': {
      resolveExactBirdLabel: async () => fixtures.birdResolver.length
        ? fixtures.birdResolver.shift()
        : null,
    },
    './_lib/perch': {
      isPerchConfigured: () => false,
      perchIdentify: async () => null,
    },
    './_lib/translate': {
      translateVendorText: async (value) => value,
      looksLikeProse: () => false,
      normaliseLanguage: (value) => String(value || 'en').toLowerCase(),
    },
    './_lib/supabaseAdmin': { requireDeviceId: () => 'test-device' },
    './_lib/entitlement': {
      checkEntitlement: async () => ({ allowed: true, subscribed: true }),
      releaseUsage: async () => {},
    },
    './_lib/rateLimit': { checkRateLimit: async () => true },
    './_lib/translateEntity': { translateEntity: async (entity) => entity },
    '../components/taxonIdentity': require('./components/taxonIdentity'),
  };

  const source = fs.readFileSync(IDENTIFY_FILE, 'utf8');
  vm.runInNewContext(
    `${source}\nmodule.exports.__identityContractTest = { CATEGORIES };\n`,
    {
      module: moduleRecord,
      exports: moduleRecord.exports,
      require(id) {
        if (dependencies[id]) return dependencies[id];
        throw new Error(`Unexpected dependency: ${id}`);
      },
      console,
      process: { env: {} },
    },
    { filename: IDENTIFY_FILE }
  );

  return {
    categories: moduleRecord.exports.__identityContractTest.CATEGORIES,
    queue(provider, value) {
      fixtures[provider].push(value);
    },
  };
}

const VALID_SOURCES = [
  ['plant', 'plant.id', 'result.classification.suggestions[].name', 'Monstera deliciosa'],
  ['insect', 'insect.id', 'result.classification.suggestions[].name', 'Apis mellifera'],
  ['mushroom', 'mushroom.id', 'result.classification.suggestions[].name', 'Amanita phalloides'],
  ['crop', 'crop.health', 'result.crop.suggestions[].scientific_name', 'Zea mays'],
  ['fish', 'fishial', 'results[].species[].fishangler-data.scientificName', 'Paracanthurus hepatus'],
  ['sound', 'perch', 'predictions[].scientific_name', 'Strix aluco'],
];

test('documented scientific fields build exact namespaced identities', () => {
  for (const [category, provider, source, scientificName] of VALID_SOURCES) {
    const identity = buildIdentityV1({
      category,
      provider,
      providerTaxonId: `${provider}-1`,
      providerLabel: scientificName,
      providerTaxonIdSource: 'provider.id',
      providerLabelSource: 'provider.label',
      scientificName,
      scientificNameSource: source,
      score: 0.91,
      scoreSource: 'provider.score',
      gbifKey: 123,
      gbifKeySource: 'provider.gbif_id',
    });

    assert.equal(identity.status, 'exact', provider);
    assert.equal(identity.provider.name, provider);
    assert.equal(identity.provider.id, `${provider}-1`);
    assert.equal(identity.taxon.canonicalName, scientificName);
    assert.equal(identity.taxon.gbifKey, '123');
    assert.equal(identity.confidence.score, 0.91);
    assert.equal(exactTaxon(identity).canonicalName, scientificName);
  }
});

test('common labels never become scientific names through an undocumented field', () => {
  const identity = buildIdentityV1({
    category: 'fish',
    provider: 'fishial',
    providerTaxonId: 'blue-tang',
    providerLabel: 'Blue tang',
    scientificName: 'Blue tang',
    scientificNameSource: 'results[].species[].name',
    score: 0.99,
  });

  assert.equal(identity.status, 'unresolved');
  assert.equal(identity.taxon.scientificName, null);
  assert.equal(exactTaxon(identity), null);
});

test('Hylesia at genus level never unlocks a species dossier', () => {
  const identity = buildIdentityV1({
    category: 'insect',
    provider: 'insect.id',
    providerTaxonId: 'hylesia-genus',
    providerLabel: 'Hylesia',
    scientificName: 'Hylesia',
    scientificNameSource: 'result.classification.suggestions[].name',
    score: 0.99,
    scoreSource: 'result.classification.suggestions[].probability',
    subjectScore: 0.99,
    subjectScoreSource: 'result.is_insect.probability',
  });

  assert.equal(identity.status, 'unresolved');
  assert.equal(identity.taxon.rank, null);
  assert.equal(enrichmentTaxon(identity, { scientificName: 'Hylesia' }), null);

  const insectScreen = fs.readFileSync(
    path.join(__dirname, 'screens', 'InsectDetailScreen.js'),
    'utf8'
  );
  assert.match(insectScreen, /getCuratedDetail\(i18n\.language, 'insect', enrichmentScientific\)/);
  assert.doesNotMatch(
    insectScreen,
    /getCuratedDetail\([^\n]*enrichmentScientific \|\| plant\.scientific/
  );
});

test('external enrichment accepts exact identity and preserves only explicit legacy records', () => {
  const exact = buildIdentityV1({
    category: 'fish',
    provider: 'fishial',
    scientificName: 'Paracanthurus hepatus',
    scientificNameSource: 'results[].species[].fishangler-data.scientificName',
    score: 0.9,
    scoreSource: 'results[].species[].accuracy',
  });
  const candidate = buildIdentityV1({
    category: 'fish',
    provider: 'fishial',
    scientificName: 'Pterois volitans',
    scientificNameSource: 'results[].species[].fishangler-data.scientificName',
    score: 0.4,
    scoreSource: 'results[].species[].accuracy',
  });

  assert.equal(enrichmentTaxon(exact, {}).canonicalName, 'Paracanthurus hepatus');
  assert.equal(enrichmentTaxon(candidate, { scientificName: 'Pterois volitans' }), null);
  assert.equal(enrichmentTaxon(null, { scientificName: 'Pterois volitans' }), null);
  assert.equal(
    enrichmentTaxon(undefined, { scientificName: 'Zea mays L.', gbifKey: 5290059 }).canonicalName,
    'Zea mays'
  );
});

test('low, absent and subject-zero confidence never become exact', () => {
  const base = {
    category: 'plant',
    provider: 'plant.id',
    providerTaxonId: 'plant-1',
    providerLabel: 'Zea mays',
    scientificName: 'Zea mays',
    scientificNameSource: 'result.classification.suggestions[].name',
    scoreSource: 'result.classification.suggestions[].probability',
    subjectScoreSource: 'result.is_plant.probability',
  };

  assert.equal(buildIdentityV1({ ...base, score: 0.64 }).status, 'candidate');
  assert.equal(buildIdentityV1(base).status, 'candidate');
  assert.equal(
    buildIdentityV1({ ...base, score: 0.99, scoreSource: undefined }).status,
    'candidate'
  );
  assert.equal(
    buildIdentityV1({ ...base, score: 0.99, subjectScore: 0 }).status,
    'candidate'
  );
});

test('Fishial without its documented scientific field stays unresolved', async () => {
  const harness = loadIdentifyHarness();
  harness.queue('fishial', {
    results: [{
      'detection-score': 0.98,
      species: [{
        'species-id': 'blue-tang',
        name: 'Blue tang',
        accuracy: 0.97,
        'fishangler-data': { title: 'Blue tang' },
      }],
    }],
  });

  const result = plain(await harness.categories.fish.run({ language: 'en' }));
  assert.equal(result.entity.name, 'Blue tang');
  assert.equal(result.entity.scientific, null);
  assert.equal(result.entity.identityV1.status, 'unresolved');
  assert.equal(result.entity.identityV1.taxon.scientificName, null);
});

test('Nyckel labels remain unresolved even at high confidence', async () => {
  const harness = loadIdentifyHarness();
  harness.queue('nyckel', {
    labelId: 'bird-blue',
    labelName: 'Blue bird',
    confidence: 0.99,
  });

  const result = plain(await harness.categories.bird.run({}));
  assert.equal(result.entity.identityV1.status, 'unresolved');
  assert.equal(result.entity.identityV1.provider.id, 'bird-blue');
  assert.equal(result.entity.identityV1.provider.label, 'Blue bird');
  assert.equal(result.entity.identityV1.taxon.scientificName, null);
});

test('an exact two-source bird label bridge creates a worldwide taxon identity', async () => {
  const harness = loadIdentifyHarness();
  harness.queue('nyckel', {
    labelId: 'american-robin',
    labelName: 'American Robin',
    confidence: 0.99,
  });
  harness.queue('birdResolver', {
    scientific: 'Turdus migratorius',
    gbifKey: 9510564,
    wikidataId: 'Q460967',
  });

  const result = plain(await harness.categories.bird.run({}));
  assert.equal(result.entity.scientific, 'Turdus migratorius');
  assert.equal(result.entity.gbifId, 9510564);
  assert.equal(result.entity.identityV1.status, 'exact');
  assert.equal(result.entity.identityV1.taxon.canonicalName, 'Turdus migratorius');
  assert.equal(result.entity.identityV1.provenance.scientificName, 'wikidata.P225+gbif.species.match');
});

test('Nyckel scientific bridge cannot become exact without its verified GBIF key', () => {
  const base = {
    category: 'bird',
    provider: 'nyckel',
    providerTaxonId: 'american-robin',
    providerLabel: 'American Robin',
    scientificName: 'Turdus migratorius',
    scientificNameSource: 'wikidata.P225+gbif.species.match',
    score: 0.99,
    scoreSource: 'confidence',
  };

  assert.equal(buildIdentityV1(base).status, 'candidate');
  assert.equal(
    buildIdentityV1({
      ...base,
      gbifKey: 9510564,
      gbifKeySource: 'unverified.client.value',
    }).status,
    'candidate'
  );
  assert.equal(
    buildIdentityV1({
      ...base,
      gbifKey: 9510564,
      gbifKeySource: 'gbif.species.match.usageKey',
    }).status,
    'exact'
  );
});

test('identityV1 survives sanitised cloud-sync round trip and status is recomputed', () => {
  const identity = buildIdentityV1({
    category: 'fish',
    provider: 'fishial',
    providerTaxonId: 'fish-42',
    providerLabel: 'Blue tang',
    providerTaxonIdSource: 'results[].species[].species-id',
    providerLabelSource: 'results[].species[].name',
    scientificName: 'Paracanthurus hepatus',
    scientificNameSource: 'results[].species[].fishangler-data.scientificName',
    score: 0.94,
    scoreSource: 'results[].species[].accuracy',
    subjectScore: 0.9,
    subjectScoreSource: 'results[].detection-score',
  });
  const entry = {
    savedId: 'saved-fish-42',
    category: 'fish',
    name: 'Blue tang',
    identityV1: identity,
  };

  const first = sanitiseEntry(entry);
  assert.deepEqual(first.payload.identityV1, identity);

  const restored = {
    savedId: first.saved_id,
    category: first.category,
    ...JSON.parse(JSON.stringify(first.payload)),
  };
  const second = sanitiseEntry(restored);
  assert.deepEqual(second.payload.identityV1, identity);

  const tampered = JSON.parse(JSON.stringify(identity));
  tampered.status = 'exact';
  tampered.confidence.score = 0;
  const cleanedTampered = sanitiseEntry({ ...entry, identityV1: tampered });
  assert.equal(cleanedTampered.payload.identityV1.status, 'candidate');
});

test('Wikipedia enrichment never searches by an unresolved common name', () => {
  const overview = fs.readFileSync(
    path.join(__dirname, 'components', 'localisedOverview.js'),
    'utf8'
  );
  const sound = fs.readFileSync(
    path.join(__dirname, 'screens', 'SoundDetailScreen.js'),
    'utf8'
  );

  assert.doesNotMatch(overview, /scientific \|\| commonName/);
  assert.match(overview, /if \(!scientific\) return null/);
  assert.doesNotMatch(sound, /plant\.scientific \|\| plant\.name/);
  assert.match(sound, /enrichmentTaxon\(plant\.identityV1/);
});

test('fauna titles prefer the active locale without freezing a bird title from an old locale', () => {
  const fish = fs.readFileSync(path.join(__dirname, 'screens/FishDetailScreen.js'), 'utf8');
  const bird = fs.readFileSync(path.join(__dirname, 'screens/BirdDetailScreen.js'), 'utf8');
  for (const source of [fish, bird]) {
    assert.match(source, /localised\?\.localised && localised\.title/);
  }
  assert.match(fish, /curatedName \|\| localisedDisplayName \|\| plant\.displayName \|\| plant\.name/);
  assert.match(bird, /curatedName \|\| localisedDisplayName \|\| plant\.name/);
  assert.match(bird, /delete stablePlant\.displayName/);
});

test('maps, public photos and galleries receive the identity gate in every API result', () => {
  for (const file of ['Plant', 'Tree', 'Crop', 'Insect', 'Mushroom', 'Fish', 'Sound']) {
    const source = fs.readFileSync(path.join(__dirname, 'screens', `${file}DetailScreen.js`), 'utf8');
    assert.match(source, /identityV1=\{plant\.identityV1\}/, file);
  }

  for (const relative of [
    'components/PlantHero.js',
    'components/IdentificationExtras.js',
    'components/DistributionMap.js',
    'components/SeasonChart.js',
  ]) {
    const source = fs.readFileSync(path.join(__dirname, relative), 'utf8');
    assert.match(source, /enrichmentTaxon\(/, relative);
  }

  const crop = fs.readFileSync(path.join(__dirname, 'screens', 'CropDetailScreen.js'), 'utf8');
  const fish = fs.readFileSync(path.join(__dirname, 'screens', 'FishDetailScreen.js'), 'utf8');
  assert.match(crop, /<FertilizerTablesCard[\s\S]+scientific=\{enrichmentScientific\}/);
  assert.match(crop, /getPestManagementProfile\(\{ scientific: enrichmentScientific/);
  assert.match(fish, /<ExactSpeciesSafety category="fish" scientific=\{enrichmentScientific\}/);
});
