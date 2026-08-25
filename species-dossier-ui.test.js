const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  clearSpeciesDossierCache,
  getSpeciesDossier,
  NOT_FOUND_TTL_MS,
  normaliseSpeciesDossier,
} = require('./components/speciesDossier');
const { buildFishDossierTopics } = require('./components/fishDossierTopics');

const ROOT = __dirname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const scientific = 'Oncorhynchus mykiss';
const sources = [
  {
    id: 'worms',
    url: 'https://www.marinespecies.org/aphia.php?p=taxdetails&id=127185',
    license: 'CC-BY-4.0',
  },
  {
    id: 'wikidata',
    url: 'https://www.wikidata.org/wiki/Q187986',
    license: 'CC0-1.0',
  },
];
const insectScientific = 'Danaus plexippus';
const insectSources = [
  {
    id: 'gbif',
    url: 'https://www.gbif.org/species/5133038',
    license: 'CC-BY-4.0',
  },
  {
    id: 'globi',
    url: 'https://globalbioticinteractions.org/?sourceTaxon=Danaus%20plexippus',
    license: 'CC-BY-4.0',
  },
];

test('the client accepts only exact, source-bound dossier facts', () => {
  const clean = normaliseSpeciesDossier({
    scientific,
    environment: { marine: true, brackish: true, freshwater: true },
    diet: [{ id: 'Q25349', label: 'crustaceans' }],
    habitat: [{ id: 'Q179049', label: 'river' }],
    reproduction: [
      { id: 'clutchSize', amount: 200, unit: 'count' },
      { id: 'incubationPeriod', amount: 8, unit: 'day' },
      { id: 'gestationPeriod', amount: 4, unit: 'month' },
    ],
    lifeCycle: [{ id: 'lifeExpectancy', amount: 6, unit: 'year' }],
    conservation: { code: 'LC' },
    sources,
  }, scientific);

  assert.deepEqual(clean.environment, { marine: true, brackish: true, freshwater: true });
  assert.deepEqual(clean.diet, [{ id: 'Q25349', label: 'crustaceans' }]);
  assert.deepEqual(clean.habitat, [{ id: 'Q179049', label: 'river' }]);
  assert.deepEqual(clean.reproduction, [
    { id: 'clutchSize', amount: 200, unit: 'count' },
    { id: 'incubationPeriod', amount: 8, unit: 'day' },
    { id: 'gestationPeriod', amount: 4, unit: 'month' },
  ]);
  assert.deepEqual(clean.lifeCycle, [{ id: 'lifeExpectancy', amount: 6, unit: 'year' }]);
  assert.deepEqual(clean.conservation, { code: 'LC' });
  assert.equal(clean.sources.length, 2);

  assert.equal(normaliseSpeciesDossier({ ...clean, scientific: 'Salmo salar' }, scientific), null);
  assert.equal(normaliseSpeciesDossier({ scientific, diet: clean.diet, sources: [] }, scientific), null);
});

test('facts disappear with the wrong source instead of inheriting attribution', () => {
  const invalidWorms = normaliseSpeciesDossier({
    scientific,
    environment: { marine: true, brackish: false, freshwater: true },
    diet: [{ id: 'Q25349', label: 'crustaceans' }],
    habitat: [],
    sources: [{ ...sources[0], url: 'https://example.com/not-worms' }, sources[1]],
  }, scientific);
  assert.equal(invalidWorms.environment, null);
  assert.equal(invalidWorms.diet.length, 1);

  const invalidWikidata = normaliseSpeciesDossier({
    scientific,
    environment: { marine: true, brackish: false, freshwater: true },
    diet: [{ id: 'Q25349', label: 'crustaceans' }],
    habitat: [{ id: 'Q179049', label: 'river' }],
    reproduction: [{ id: 'clutchSize', amount: 200, unit: 'count' }],
    lifeCycle: [{ id: 'lifeExpectancy', amount: 6, unit: 'year' }],
    conservation: { code: 'LC' },
    sources: [sources[0], { ...sources[1], license: 'unknown' }],
  }, scientific);
  assert.ok(invalidWikidata.environment);
  assert.deepEqual(invalidWikidata.diet, []);
  assert.deepEqual(invalidWikidata.habitat, []);
  assert.deepEqual(invalidWikidata.reproduction, []);
  assert.deepEqual(invalidWikidata.lifeCycle, []);
  assert.equal(invalidWikidata.conservation, null);
});

test('local article sections require an approved Wikipedia URL and license', () => {
  const payload = {
    scientific,
    wikiSections: [{
      key: 'habitat',
      heading: 'Habitat',
      text: 'A espÃ©cie ocorre em rios frios e bem oxigenados durante parte do ciclo.',
    }],
    sources: [{
      id: 'wikipedia',
      url: 'https://pt.wikipedia.org/wiki/Oncorhynchus_mykiss',
      license: 'CC-BY-SA-4.0',
    }],
  };
  const clean = normaliseSpeciesDossier(payload, scientific);
  assert.equal(clean.wikiSections[0].key, 'habitat');

  for (const source of [
    { ...payload.sources[0], url: 'https://example.com/wiki/Oncorhynchus_mykiss' },
    { ...payload.sources[0], url: `${payload.sources[0].url}?oldid=1` },
    { ...payload.sources[0], license: 'unknown' },
  ]) {
    assert.equal(normaliseSpeciesDossier({ ...payload, sources: [source] }, scientific), null);
  }
});

test('insect interactions require exact GBIF plus GloBI proof and keep only real fields', () => {
  const payload = {
    scientific: insectScientific,
    feeding: [
      { id: 'eats:GBIF:3170240', name: 'Asclepias curassavica', relation: 'eats' },
      { id: 'eats:no:match', name: 'unresolved host', relation: 'eats' },
    ],
    plantAssociations: [
      { id: 'pollinates:GBIF:5424063', name: 'Lantana camara', relation: 'pollinates' },
    ],
    ecologicalRelations: [
      { id: 'preysOn:EOL:1234', name: 'Aphis nerii', relation: 'preysOn' },
      { id: 'invented:EOL:999', name: 'Invented relation', relation: 'invented' },
    ],
    documentedLifeStages: ['adult', 'larva', 'unknown', 'adult'],
    sources: insectSources,
  };
  const clean = normaliseSpeciesDossier(payload, insectScientific);

  assert.deepEqual(clean.feeding, [
    { id: 'eats:GBIF:3170240', name: 'Asclepias curassavica', relation: 'eats' },
  ]);
  assert.deepEqual(clean.plantAssociations, [
    { id: 'pollinates:GBIF:5424063', name: 'Lantana camara', relation: 'pollinates' },
  ]);
  assert.deepEqual(clean.ecologicalRelations, [
    { id: 'preysOn:EOL:1234', name: 'Aphis nerii', relation: 'preysOn' },
  ]);
  assert.deepEqual(clean.documentedLifeStages, ['larva', 'adult']);

  assert.equal(normaliseSpeciesDossier({
    ...payload,
    sources: [insectSources[1]],
  }, insectScientific), null);
  assert.equal(normaliseSpeciesDossier({
    ...payload,
    sources: [insectSources[0], {
      ...insectSources[1],
      url: 'https://globalbioticinteractions.org/?sourceTaxon=Apis%20mellifera',
    }],
  }, insectScientific), null);
});

test('a source-bound partial taxonomy remains usable when editorial facts are empty', () => {
  const clean = normaliseSpeciesDossier({
    scientific: 'Anticarsia gemmatalis',
    taxonomy: {
      sourceId: 'gbif',
      species: 'Anticarsia gemmatalis',
      kingdom: 'Animalia',
      phylum: 'Arthropoda',
      className: 'Insecta',
      order: 'Lepidoptera',
      family: 'Erebidae',
      genus: 'Anticarsia',
    },
    sources: [{
      id: 'gbif',
      url: 'https://www.gbif.org/species/1777942',
      license: 'CC-BY-4.0',
    }],
    partial: true,
  }, 'Anticarsia gemmatalis');

  assert.deepEqual(clean.taxonomy, {
    sourceId: 'gbif',
    species: 'Anticarsia gemmatalis',
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    className: 'Insecta',
    order: 'Lepidoptera',
    family: 'Erebidae',
    genus: 'Anticarsia',
  });
  assert.equal(clean.partial, true);
  assert.equal(normaliseSpeciesDossier({
    scientific: 'Anticarsia gemmatalis',
    taxonomy: { ...clean.taxonomy, sourceId: 'worms' },
    sources: clean.sources,
    partial: true,
  }, 'Anticarsia gemmatalis'), null);
  assert.equal(normaliseSpeciesDossier({
    scientific: 'Anticarsia gemmatalis',
    taxonomy: clean.taxonomy,
    sources: clean.sources,
    partial: false,
  }, 'Anticarsia gemmatalis'), null);
});

test('measurements enforce ids, units, numeric limits, deduplication and IUCN codes', () => {
  const clean = normaliseSpeciesDossier({
    scientific,
    reproduction: [
      { id: 'clutchSize', amount: 200, unit: 'count' },
      { id: 'clutchSize', amount: 200, unit: 'count' },
      { id: 'clutchSize', amount: 2, unit: 'day' },
      { id: 'incubationPeriod', amount: 1, unit: 'year' },
      { id: 'gestationPeriod', amount: 3, unit: 'hour' },
      { id: 'gestationPeriod', amount: 4, unit: 'month' },
      { id: 'unknown', amount: 4, unit: 'month' },
    ],
    lifeCycle: [
      { id: 'lifeExpectancy', amount: 6, unit: 'year' },
      { id: 'longestLifespan', amount: Number.POSITIVE_INFINITY, unit: 'year' },
      { id: 'longestLifespan', amount: 1000001, unit: 'day' },
    ],
    conservation: { code: 'CR' },
    sources: [sources[1]],
  }, scientific);

  assert.deepEqual(clean.reproduction, [
    { id: 'clutchSize', amount: 200, unit: 'count' },
    { id: 'gestationPeriod', amount: 4, unit: 'month' },
  ]);
  assert.deepEqual(clean.lifeCycle, [{ id: 'lifeExpectancy', amount: 6, unit: 'year' }]);
  assert.deepEqual(clean.conservation, { code: 'CR' });

  const invalidCode = normaliseSpeciesDossier({
    scientific,
    conservation: { code: 'SAFE' },
    sources: [sources[1]],
  }, scientific);
  assert.equal(invalidCode, null);
});

test('dossier requests share an in-flight promise and cache verified results', async () => {
  clearSpeciesDossierCache();
  let calls = 0;
  const payload = {
    scientific,
    environment: { marine: true, brackish: false, freshwater: true },
    diet: [],
    habitat: [],
    sources: [sources[0]],
  };
  const fetchImpl = async () => {
    calls += 1;
    await Promise.resolve();
    return { ok: true, status: 200, json: async () => payload };
  };
  const args = { category: 'fish', scientific, language: 'pt', fetchImpl };
  const [first, second] = await Promise.all([
    getSpeciesDossier(args),
    getSpeciesDossier(args),
  ]);
  const third = await getSpeciesDossier(args);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
});

test('partial dossiers retry once immediately and remain uncached when both attempts are partial', async () => {
  clearSpeciesDossierCache();
  let calls = 0;
  const payload = {
    scientific,
    environment: { marine: true, brackish: false, freshwater: true },
    diet: [],
    habitat: [],
    sources: [sources[0]],
    partial: true,
  };
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => payload };
  };
  const args = { category: 'fish', scientific, language: 'pt', fetchImpl };
  assert.equal((await getSpeciesDossier(args)).partial, true);
  assert.equal((await getSpeciesDossier(args)).partial, true);
  assert.equal(calls, 4);
});

test('a richer retry completes the same fish visit and is cached', async () => {
  clearSpeciesDossierCache();
  let calls = 0;
  const urls = [];
  const partial = {
    scientific,
    taxonomy: { sourceId: 'worms', species: scientific, family: 'Salmonidae' },
    environment: { marine: true, brackish: false, freshwater: true },
    diet: [],
    habitat: [],
    sources: [sources[0]],
    partial: true,
  };
  const complete = {
    ...partial,
    partial: false,
    sources,
    diet: [{ id: 'Q1', label: 'Crustaceos' }],
  };
  const fetchImpl = async (url) => {
    calls += 1;
    urls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => (calls === 1 ? partial : complete),
    };
  };
  const args = {
    apiBase: 'https://naturelensapp.cloud',
    category: 'fish',
    scientific,
    language: 'pt',
    fetchImpl,
    nowImpl: () => 45000,
  };

  const first = await getSpeciesDossier(args);
  const cached = await getSpeciesDossier(args);
  assert.equal(first.partial, false);
  assert.equal(first.diet[0].label, 'Crustaceos');
  assert.equal(cached, first);
  assert.equal(calls, 2);
  assert.equal(new URL(urls[1]).searchParams.get('refresh'), '3');
});

test('a 404 expires, retries once per key and bypasses an old CDN miss', async () => {
  clearSpeciesDossierCache();
  let calls = 0;
  let now = 1000;
  const urls = [];
  const payload = {
    scientific,
    environment: { marine: true, brackish: false, freshwater: true },
    diet: [],
    habitat: [],
    sources: [sources[0]],
  };
  const fetchImpl = async (url) => {
    calls += 1;
    urls.push(url);
    await Promise.resolve();
    if (calls === 1) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => payload };
  };
  const args = {
    apiBase: 'https://naturelensapp.cloud',
    category: 'fish',
    scientific,
    language: 'pt',
    fetchImpl,
    nowImpl: () => now,
  };

  assert.equal(await getSpeciesDossier(args), null);
  assert.equal(await getSpeciesDossier(args), null);
  assert.equal(calls, 1);

  now += NOT_FOUND_TTL_MS + 1;
  const [firstRetry, sharedRetry] = await Promise.all([
    getSpeciesDossier(args),
    getSpeciesDossier(args),
  ]);
  assert.deepEqual(firstRetry, sharedRetry);
  assert.equal(firstRetry.scientific, scientific);
  assert.equal(calls, 2);
  assert.equal(new URL(urls[0]).searchParams.has('refresh'), false);
  assert.equal(
    new URL(urls[1]).searchParams.get('refresh'),
    String(Math.floor(now / NOT_FOUND_TTL_MS))
  );

  assert.deepEqual(await getSpeciesDossier(args), firstRetry);
  assert.equal(calls, 2);
});

test('fish and invertebrate expert views use the exact dynamic dossier', () => {
  for (const screen of ['screens/FishDetailScreen.js', 'screens/InsectDetailScreen.js']) {
    const source = read(screen);
    assert.match(source, /import DynamicSpeciesDossier/);
    assert.match(source, /<DynamicSpeciesDossier/);
    assert.match(source, /identityV1=\{plant\.identityV1\}/);
    assert.match(source, /dossier=\{speciesDossier\}/,
      `${screen}: o card e as abas precisam compartilhar a mesma consulta`);
  }

  const component = read('components/DynamicSpeciesDossier.js');
  assert.match(component, /enrichmentTaxon\(identityV1/);
  assert.match(component, /externallyManaged \|\| !exactScientific/);
  assert.match(component, /if \(!dossier\) return null/);
  assert.match(component, /externallyManaged \|\| !exactScientific/);
  assert.match(component, /Intl\.NumberFormat/);
  assert.match(component, /speciesDossier\.measurements/);
  assert.match(component, /insectRedListLabel\(dossier\.conservation, t\)/);
  assert.match(component, /dossier\?\.feeding/);
  assert.match(component, /dossier\?\.plantAssociations/);
  assert.match(component, /dossier\?\.ecologicalRelations/);
  assert.match(component, /dossier\?\.documentedLifeStages/);
  assert.match(component, /speciesDossier\.lifeStages\./);
  assert.match(component, /observationWorkspace\.contexts\.insect\.onPlant/);
  assert.doesNotMatch(component, /Loading|No data|Unknown|Not available/);
});

test('verified fish fields become six real, localised manual topics', () => {
  const dossier = normaliseSpeciesDossier({
    scientific,
    environment: { marine: true, brackish: true, freshwater: true },
    diet: [{ id: 'Q25349', label: 'crustaceans' }],
    habitat: [{ id: 'Q179049', label: 'river' }],
    reproduction: [{ id: 'clutchSize', amount: 200, unit: 'count' }],
    lifeCycle: [{ id: 'lifeExpectancy', amount: 6, unit: 'year' }],
    conservation: { code: 'LC' },
    sources,
  }, scientific);
  const labels = {
    'speciesDossier.environment': 'Recorded water types',
    'speciesDossier.diet': 'Documented feeding',
    'speciesDossier.habitat': 'Documented habitat',
    'speciesDossier.reproduction': 'Documented reproduction',
    'speciesDossier.lifeCycle': 'Documented life cycle',
    'speciesDossier.brackish': 'Brackish water',
    'speciesDossier.measurements.clutchSize': 'Clutch size',
    'speciesDossier.measurements.lifeExpectancy': 'Life expectancy',
    'observationWorkspace.contexts.fish.freshwater': 'Fresh water',
    'observationWorkspace.contexts.fish.marine': 'Marine water',
    'detail.conservationStatus': 'Conservation status',
    'detail.iucn.leastConcern': 'Least concern',
  };
  const topics = buildFishDossierTopics({
    dossier,
    scientific,
    language: 'en',
    translate: (key) => labels[key] || key,
  });

  assert.deepEqual(topics.map((topic) => topic.key), [
    'environment',
    'diet',
    'habitat',
    'reproduction',
    'lifeCycle',
    'conservation',
  ]);
  assert.match(topics.find((topic) => topic.key === 'environment').text, /Fresh water/);
  assert.match(topics.find((topic) => topic.key === 'diet').text, /crustaceans/);
  assert.match(topics.find((topic) => topic.key === 'reproduction').text, /Clutch size: 200/);
  assert.match(topics.find((topic) => topic.key === 'lifeCycle').text, /Life expectancy: 6 years/);
  assert.equal(topics.find((topic) => topic.key === 'conservation').text, 'Least concern');
  assert.deepEqual(topics.find((topic) => topic.key === 'environment').sourceIds, ['worms']);
  assert.deepEqual(topics.find((topic) => topic.key === 'diet').sourceIds, ['worms', 'wikidata']);
});

test('fish manual topics fail closed without exact provenance or translated chrome', () => {
  const wikidataOnly = normaliseSpeciesDossier({
    scientific,
    diet: [{ id: 'Q25349', label: 'crustaceans' }],
    habitat: [{ id: 'Q179049', label: 'river' }],
    sources: [sources[1]],
  }, scientific);
  assert.deepEqual(buildFishDossierTopics({
    dossier: wikidataOnly,
    scientific,
    language: 'en',
    translate: (key) => key,
  }), []);
});

test('fish dynamic dossiers are reachable before expert mode without changing safety order', () => {
  const source = read('screens/FishDetailScreen.js');
  assert.match(source, /getSpeciesDossier\(\{/);
  assert.match(source, /category: 'fish'/);
  assert.match(source, /scientific: enrichmentScientific/);
  assert.match(source, /buildFishDossierTopics\(\{/);
  assert.match(source, /dossier: speciesDossier/);
  for (const key of [
    'dynamicEnvironment',
    'dynamicDiet',
    'dynamicHabitat',
    'dynamicReproduction',
    'dynamicLifeCycle',
    'dynamicConservation',
  ]) {
    assert.ok(source.includes(key), key);
  }
  assert.ok(
    source.indexOf('<ExactSpeciesSafety') < source.indexOf('<TopicNavigatorCard'),
    'safety must remain ahead of every dynamic topic'
  );
  assert.ok(
    source.indexOf('<TopicNavigatorCard') < source.indexOf('depth={RESULT_DEPTHS.EXPERT}'),
    'dynamic topics must stay reachable outside expert mode'
  );
});

test('verified insect dossier fields become real tabs in the permanent technical dossier', () => {
  const source = read('screens/InsectDetailScreen.js');
  const builder = read('components/insectDossierTopics.js');
  assert.match(source, /getSpeciesDossier\(\{/);
  assert.match(source, /scientific: enrichmentScientific/);
  assert.match(source, /buildInsectDossierTopics\(\{/);
  assert.match(builder, /buildCategoryDepthTopics\(\{ category: 'insect'/);
  for (const key of [
    'feeding', 'documentedFeeding', 'habitat', 'reproduction', 'lifeCycle',
    'plantAssociations', 'ecologicalRelations',
  ]) {
    assert.match(builder, new RegExp(`${key}: Object\\.freeze`), key);
  }
  const manual = source.indexOf('<TopicNavigatorCard');
  const groupGuide = source.indexOf('<GroupGuideCard', manual);
  const technicalBody = source.indexOf('depth={RESULT_DEPTHS.EXPERT}', groupGuide);
  assert.match(source, /const resultDepth = RESULT_DEPTHS\.EXPERT;/);
  assert.doesNotMatch(source, /<ResultDepthSwitcher|useResultDepthPreference/);
  assert.ok(
    manual >= 0 && groupGuide > manual && technicalBody > groupGuide,
    'species tabs and honest group guidance remain visible above the technical body'
  );
});

test('documented insect stages are visible and translated without fabricating absent stages', () => {
  const screen = read('screens/InsectDetailScreen.js');
  const builder = read('components/insectDossierTopics.js');
  const registry = read('components/insectLifeStageRegistry.js');
  const component = read('components/DynamicSpeciesDossier.js');
  assert.match(screen, /buildInsectDossierTopics\(\{/);
  assert.match(builder, /topic\.key === 'lifeStages'/);
  assert.match(builder, /getInsectLifeStageProfile\(scientific\)/);
  assert.match(registry, /larvalInstars: 6/);
  assert.match(component, /title=\{t\('speciesDossier\.lifeStagesTitle'\)\}/);

  for (const code of ['ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pl', 'pt', 'sv', 'tr', 'zh', 'zh-hant']) {
    const ui = JSON.parse(read(`public/locales/${code}.json`));
    assert.ok(ui.speciesDossier.lifeStagesTitle?.trim(), `${code}: life stages title`);
    assert.deepEqual(
      Object.keys(ui.speciesDossier.lifeStages).sort(),
      ['adult', 'egg', 'larva', 'nymph', 'pupa'],
      `${code}: exact supported stage labels`
    );
    for (const label of Object.values(ui.speciesDossier.lifeStages)) {
      assert.ok(typeof label === 'string' && label.trim(), `${code}: visible stage label`);
    }
  }
});

test('all 17 locales label the curated larval evidence without fallback', () => {
  const locales = ['ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pl', 'pt', 'sv', 'tr', 'zh', 'zh-hant'];
  const keys = ['larvalInstars', 'bodyLength', 'leafConsumption', 'leafAreaPerLarva'];

  for (const locale of locales) {
    const dossier = JSON.parse(read(`public/locales/${locale}.json`)).speciesDossier;
    for (const key of keys) {
      assert.ok(typeof dossier[key] === 'string' && dossier[key].trim(), `${locale}: speciesDossier.${key}`);
    }
    assert.match(dossier.larvalInstars, /\{\{\s*count\s*\}\}/, `${locale}: larvalInstars keeps {{count}}`);
  }
});

test('all locales carry dossier, anatomy and IUCN labels without English fallback', () => {
  const locales = ['ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pl', 'pt', 'sv', 'tr', 'zh', 'zh-hant'];
  const expectedDossier = Object.keys(JSON.parse(read('public/locales/en.json')).speciesDossier).sort();
  const expectedIucn = Object.keys(JSON.parse(read('public/locales/en.json')).detail.iucn).sort();
  const anatomy = ['cephalothorax', 'abdomen', 'eyes', 'eightLegs', 'tentacles', 'shell', 'muscularFoot', 'anterior', 'segments', 'clitellum', 'posterior'];

  for (const locale of locales) {
    const json = JSON.parse(read(`public/locales/${locale}.json`));
    assert.deepEqual(Object.keys(json.speciesDossier).sort(), expectedDossier, `${locale}: dossier`);
    assert.deepEqual(Object.keys(json.detail.iucn).sort(), expectedIucn, `${locale}: IUCN`);
    for (const key of anatomy) {
      assert.ok(json.learning.parts[key]?.trim(), `${locale}: learning.parts.${key}`);
    }
  }
});

test('all 17 locales can build every verified fish topic without a fallback key', () => {
  const dossier = normaliseSpeciesDossier({
    scientific,
    environment: { marine: true, brackish: true, freshwater: true },
    diet: [{ id: 'Q25349', label: 'crustaceans' }],
    habitat: [{ id: 'Q179049', label: 'river' }],
    reproduction: [{ id: 'clutchSize', amount: 200, unit: 'count' }],
    lifeCycle: [{ id: 'lifeExpectancy', amount: 6, unit: 'year' }],
    conservation: { code: 'LC' },
    sources,
  }, scientific);
  const locales = ['ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pl', 'pt', 'sv', 'tr', 'zh', 'zh-hant'];

  for (const locale of locales) {
    const json = JSON.parse(read(`public/locales/${locale}.json`));
    const translate = (key) => key.split('.').reduce((value, part) => value?.[part], json) || key;
    const topics = buildFishDossierTopics({
      dossier,
      scientific,
      language: locale,
      translate,
    });
    assert.deepEqual(topics.map((topic) => topic.key), [
      'environment',
      'diet',
      'habitat',
      'reproduction',
      'lifeCycle',
      'conservation',
    ], locale);
    assert.ok(topics.every((topic) => !topic.label.includes('.')), `${locale}: translated labels`);
  }
});

test('invertebrate conservation uses the strict translated normaliser', () => {
  const source = read('screens/InsectDetailScreen.js');
  assert.match(source, /insectRedListLabel\(plant\.redList, t\)/);
  assert.doesNotMatch(source, /technicalText\(plant\.redList\)/);
});
