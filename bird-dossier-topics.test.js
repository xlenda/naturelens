const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normaliseBirdDossier } = require('./components/birdSpeciesDossier');
const { buildBirdDossierTopics } = require('./components/birdDossierTopics');

const ROOT = __dirname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pt = JSON.parse(read('public/locales/pt.json'));
const scientific = 'Turdus migratorius';
const sources = [
  { id: 'gbif', url: 'https://www.gbif.org/species/9510564', license: 'CC-BY-4.0' },
  { id: 'wikidata', url: 'https://www.wikidata.org/wiki/Q460967', license: 'CC0-1.0' },
];

function translate(key) {
  return key.split('.').reduce((value, part) => value?.[part], pt) || key;
}

function dossier(overrides = {}) {
  return normaliseBirdDossier({
    scientific,
    diet: [{ id: 'Q25349', label: 'insetos' }],
    habitat: [{ id: 'Q179049', label: 'floresta' }],
    reproduction: [
      { id: 'clutchSize', amount: 3, unit: 'count' },
      { id: 'incubationPeriod', amount: 13, unit: 'day' },
    ],
    lifeCycle: [{ id: 'longestLifespan', amount: 14, unit: 'year' }],
    conservation: { code: 'LC' },
    sources,
    ...overrides,
  }, scientific);
}

test('an exact bird dossier becomes five truthful manual tabs in the reader language', () => {
  const topics = buildBirdDossierTopics({
    scientific,
    dossier: dossier(),
    language: 'pt-BR',
    translate,
  });

  assert.deepEqual(topics.map((topic) => topic.key), [
    'diet',
    'habitat',
    'reproduction',
    'lifeCycle',
    'conservation',
  ]);
  assert.match(topics[0].text, /insetos/);
  assert.match(topics[2].text, /Tamanho da postura: 3/);
  assert.match(topics[2].text, /Incuba[cç][aã]o dos ovos: 13 dias/);
  assert.equal(topics[4].text, 'Pouco preocupante');
  assert.ok(topics.every((topic) =>
    topic.evidenceSourceIds.join(',') === 'gbif,wikidata'
  ));
});

test('missing, mismatched or unproved bird data creates no empty tab', () => {
  assert.deepEqual(buildBirdDossierTopics({
    scientific,
    dossier: null,
    language: 'pt',
    translate,
  }), []);

  assert.deepEqual(buildBirdDossierTopics({
    scientific: 'Turdus rufiventris',
    dossier: dossier(),
    language: 'pt',
    translate,
  }), []);

  const rawWithoutGbif = {
    scientific,
    diet: [{ id: 'Q25349', label: 'insetos' }],
    sources: [sources[1]],
  };
  assert.deepEqual(buildBirdDossierTopics({
    scientific,
    dossier: rawWithoutGbif,
    language: 'pt',
    translate,
  }), []);

  const onlyDiet = dossier({
    habitat: [],
    reproduction: [],
    lifeCycle: [],
    conservation: null,
  });
  assert.deepEqual(buildBirdDossierTopics({
    scientific,
    dossier: onlyDiet,
    language: 'pt',
    translate,
  }).map((topic) => topic.key), ['diet']);
});

test('bird screen fetches once and shares the normalised dossier with card and tabs', () => {
  const screen = read('screens/BirdDetailScreen.js');
  const component = read('components/DynamicBirdDossier.js');
  const fetchCalls = screen.match(/getBirdSpeciesDossier\s*\(/g) || [];

  assert.equal(fetchCalls.length, 1);
  assert.match(screen, /const \[birdDossier, setBirdDossier\] = useState\(undefined\)/);
  assert.match(screen, /setBirdDossier\(resolvedScientific \? undefined : null\)/);
  assert.match(screen, /buildBirdDossierTopics\(\{[\s\S]*dossier: birdDossier/);
  assert.match(screen, /<DynamicBirdDossier[\s\S]*dossier=\{birdDossier\}/);
  assert.match(screen, /habitatText = \[curated\?\.habitat, dynamicHabitat\?\.text\]/);
  assert.doesNotMatch(component, /getBirdSpeciesDossier|useEffect|useState/);
});
