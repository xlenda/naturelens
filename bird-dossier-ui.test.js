const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  clearBirdSpeciesDossierCache,
  getBirdSpeciesDossier,
  normaliseBirdDossier,
} = require('./components/birdSpeciesDossier');

const ROOT = __dirname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const scientific = 'Turdus migratorius';
const sources = [
  { id: 'gbif', url: 'https://www.gbif.org/species/9510564', license: 'CC-BY-4.0' },
  { id: 'wikidata', url: 'https://www.wikidata.org/wiki/Q460967', license: 'CC0-1.0' },
];

test('bird client binds every field to exact GBIF and Wikidata sources', () => {
  const clean = normaliseBirdDossier({
    scientific,
    environment: null,
    diet: [{ id: 'Q25349', label: 'insetos' }],
    habitat: [{ id: 'Q179049', label: 'floresta' }],
    reproduction: [
      { id: 'clutchSize', amount: 3, unit: 'count' },
      { id: 'incubationPeriod', amount: 13, unit: 'day' },
      { id: 'lifeExpectancy', amount: 2, unit: 'year' },
    ],
    lifeCycle: [{ id: 'longestLifespan', amount: 14, unit: 'year' }],
    conservation: { code: 'LC' },
    sources,
  }, scientific);

  assert.deepEqual(clean.diet, [{ id: 'Q25349', label: 'insetos' }]);
  assert.equal(clean.reproduction.length, 2);
  assert.deepEqual(clean.lifeCycle, [{ id: 'longestLifespan', amount: 14, unit: 'year' }]);
  assert.deepEqual(clean.conservation, { code: 'LC' });
  assert.equal(normaliseBirdDossier({ ...clean, scientific: 'Turdus rufiventris' }, scientific), null);
  assert.equal(normaliseBirdDossier({ ...clean, sources: [sources[1]] }, scientific), null);
});

test('Wikidata facts disappear when their source or schema is invalid', () => {
  const clean = normaliseBirdDossier({
    scientific,
    diet: [{ id: 'Q25349', label: 'insetos' }],
    habitat: [],
    reproduction: [{ id: 'clutchSize', amount: 3, unit: 'year' }],
    lifeCycle: [{ id: 'longestLifespan', amount: Infinity, unit: 'year' }],
    conservation: { code: 'UNKNOWN' },
    sources: [sources[0]],
  }, scientific);
  assert.equal(clean, null, 'a GBIF proof without any dossier fact must render no card');
});

test('a bird can use exact GBIF proof plus a validated local article section', () => {
  const wiki = {
    id: 'wikipedia',
    url: 'https://pt.wikipedia.org/wiki/Turdus_migratorius',
    license: 'CC-BY-SA-4.0',
  };
  const payload = {
    scientific,
    wikiSections: [{
      key: 'migration',
      heading: 'MigraÃ§Ã£o',
      text: 'A populaÃ§Ã£o documentada realiza deslocamentos sazonais entre regiÃµes.',
    }],
    sources: [sources[0], wiki],
  };
  const clean = normaliseBirdDossier(payload, scientific);
  assert.equal(clean.wikiSections[0].key, 'migration');
  assert.equal(normaliseBirdDossier({
    ...payload,
    sources: [sources[0], { ...wiki, url: `${wiki.url}#section` }],
  }, scientific), null);
});

test('bird dossier requests share an in-flight promise and cache exact results', async () => {
  clearBirdSpeciesDossierCache();
  let calls = 0;
  const payload = {
    scientific,
    diet: [{ id: 'Q25349', label: 'insetos' }],
    habitat: [],
    reproduction: [],
    lifeCycle: [],
    conservation: null,
    sources,
    partial: false,
  };
  const fetchImpl = async () => {
    calls += 1;
    await Promise.resolve();
    return { ok: true, status: 200, json: async () => payload };
  };
  const args = { scientific, language: 'pt', fetchImpl };
  const [first, second] = await Promise.all([
    getBirdSpeciesDossier(args),
    getBirdSpeciesDossier(args),
  ]);
  const third = await getBirdSpeciesDossier(args);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
});

test('a partial bird dossier is usable once but never pinned in memory', async () => {
  clearBirdSpeciesDossierCache();
  let calls = 0;
  const payload = {
    scientific,
    diet: [{ id: 'Q25349', label: 'insetos' }],
    habitat: [],
    reproduction: [],
    lifeCycle: [],
    conservation: null,
    sources,
    partial: true,
  };
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => payload };
  };
  const args = { scientific, language: 'pt', fetchImpl };
  assert.equal((await getBirdSpeciesDossier(args)).partial, true);
  assert.equal((await getBirdSpeciesDossier(args)).partial, true);
  assert.equal(calls, 2);
});

test('a bird dossier retries after a 404 instead of pinning absence forever', async () => {
  clearBirdSpeciesDossierCache();
  let calls = 0;
  const payload = {
    scientific,
    diet: [{ id: 'Q25349', label: 'insetos' }],
    habitat: [],
    reproduction: [],
    lifeCycle: [],
    conservation: null,
    sources,
    partial: false,
  };
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1
      ? { ok: false, status: 404, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => payload };
  };
  const args = { scientific, language: 'pt', fetchImpl };

  assert.equal(await getBirdSpeciesDossier(args), null);
  assert.deepEqual(await getBirdSpeciesDossier(args), normaliseBirdDossier(payload, scientific));
  assert.equal(calls, 2);
});

test('bird expert view mounts the dynamic dossier beyond curated entries', () => {
  const screen = read('screens/BirdDetailScreen.js');
  assert.match(screen, /import DynamicBirdDossier/);
  assert.match(screen, /const legacyScientific = plant\.identityV1 === undefined/);
  assert.match(screen, /providerTaxon\?\.canonicalName \|\| legacyScientific/);
  assert.match(screen, /<DynamicBirdDossier/);
  assert.match(screen, /scientific=\{resolvedScientific\}/);
  assert.match(screen, /const resultDepth = RESULT_DEPTHS\.EXPERT;/);
  assert.doesNotMatch(screen, /<ResultDepthSwitcher|useResultDepthPreference/);

  const component = read('components/DynamicBirdDossier.js');
  assert.match(component, /if \(!dossier\) return null/);
  assert.match(component, /Intl\.NumberFormat/);
  assert.doesNotMatch(component, /Loading|No data|Unknown|Not available/);
});

test('bird overview renders real prose and never substitutes a missing-data placeholder', () => {
  const screen = read('screens/BirdDetailScreen.js');
  const branchStart = screen.indexOf(') : resolvedOverview ? (');
  const branchEnd = screen.indexOf('\n          ) : null}', branchStart);
  const uncuratedOverviewBranch = screen.slice(branchStart, branchEnd + 21);

  assert.doesNotMatch(screen, /sound\.noContentBody/);
  assert.ok(branchStart >= 0 && branchEnd > branchStart, 'the sourced-only branch must exist');
  assert.match(uncuratedOverviewBranch, /<SectionCard/);
  assert.match(uncuratedOverviewBranch, /<TranslatableText[\s\S]*text=\{resolvedOverview\}/,
    'an uncurated but sourced overview must remain visible');
  assert.match(uncuratedOverviewBranch, /\) : null\}/,
    'without real prose the entire overview card must disappear');
});

test('all locales carry reproduction and life-cycle labels without fallback', () => {
  const locales = ['ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pl', 'pt', 'sv', 'tr', 'zh', 'zh-hant'];
  const measurements = ['clutchSize', 'incubationPeriod', 'lifeExpectancy', 'longestLifespan', 'gestationPeriod'];
  for (const locale of locales) {
    const json = JSON.parse(read(`public/locales/${locale}.json`));
    assert.ok(json.speciesDossier.reproduction?.trim(), `${locale}: reproduction`);
    assert.ok(json.speciesDossier.lifeCycle?.trim(), `${locale}: lifeCycle`);
    for (const key of measurements) {
      assert.ok(json.speciesDossier.measurements?.[key]?.trim(), `${locale}: ${key}`);
    }
  }
});
