const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { uiLocaleFiles } = require('./test-locales');
const { translateEntity } = require('./api/_lib/translateEntity');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

test('all locales name the broad result groups without narrowing the taxon', () => {
  const files = uiLocaleFiles();
  assert.equal(files.length, 17);

  for (const file of files) {
    const locale = JSON.parse(read(path.join('public', 'locales', file)));
    for (const key of ['invertebrateLabel', 'fungusLabel']) {
      assert.ok(
        typeof locale.detail?.[key] === 'string' && locale.detail[key].trim(),
        `${file}: detail.${key} must be a non-empty translation`
      );
    }
  }

  const cases = [
    ['screens/InsectDetailScreen.js', 'invertebrateLabel', 'insect'],
    ['screens/MushroomDetailScreen.js', 'fungusLabel', 'mushroom'],
  ];

  for (const [file, key, narrowCategory] of cases) {
    const source = read(file);
    assert.match(source, new RegExp(`const resultTypeLabel = t\\('detail\\.${key}'\\)`));
    assert.match(source, /shareEntity\(plant, resultTypeLabel\)/);
    assert.match(source, /categoryLabel=\{resultTypeLabel\}/);
    assert.match(source, /profileTitle', \{ category: resultTypeLabel \}/);
    assert.doesNotMatch(
      source,
      new RegExp(`t\\('categories\\.${narrowCategory}\\.label'\\)`),
      `${file}: the result label must not narrow every vendor match to ${narrowCategory}`
    );
  }
});

test('mushroom food status keeps caution and danger visually distinct', () => {
  const source = read('screens/MushroomDetailScreen.js');

  for (const positive of ['choice', 'edible']) {
    assert.match(
      source,
      new RegExp(`(?:'${positive}'|${positive}):\\s*colors\\.warning`),
      `${positive} is evidence, not permission to eat, and must stay amber`
    );
  }
  for (const dangerous of ['poisonous', 'toxic', 'deadly']) {
    assert.match(
      source,
      new RegExp(`(?:'${dangerous}'|${dangerous}):\\s*colors\\.error`),
      `${dangerous} must stay red`
    );
  }
  assert.match(source, /edibilityColor\(plant\.edibility\)/);
  assert.match(source, /readerEdibilityLabel\([\s\S]*plant\.edibility,[\s\S]*plant\.edibilityLabel/);
  assert.match(source, /edColor === colors\.error,[\s\S]*t\('detail\.toxicShort'\)/);
  assert.match(source, /value: displayedEdibilityLabel/);
  assert.doesNotMatch(source, /plant\.edibilityLabel \|\| plant\.edibility/);
  assert.doesNotMatch(source, /\{plant\.edibility\}/, 'the raw severity key must never be rendered');
});

test('mushroom edibility is readable in English and fails closed in every other locale', () => {
  const source = read('screens/MushroomDetailScreen.js');
  const helperSource = source.match(/function readerEdibilityLabel[\s\S]*?\n}/)?.[0];
  assert.ok(helperSource, 'readerEdibilityLabel is missing');
  const readerEdibilityLabel = new Function(
    `${helperSource}; return readerEdibilityLabel;`
  )();

  assert.equal(readerEdibilityLabel('edible', null, 'en-US', false, 'Toxic'), 'edible');
  assert.equal(readerEdibilityLabel('edible', null, 'pt-BR', false, 'Tóxico'), null);
  assert.equal(readerEdibilityLabel('deadly', null, 'pt-BR', true, 'Tóxico'), 'Tóxico');
  assert.equal(readerEdibilityLabel('deadly', 'Mortal', 'pt-BR', true, 'Tóxico'), 'Mortal');
  assert.equal(readerEdibilityLabel('deadly', 'deadly', 'pt-BR', true, 'Tóxico'), 'Tóxico');
});

test('the complete mushroom look-alike comparison precedes maps, charts and guides', () => {
  const source = read('screens/MushroomDetailScreen.js');
  const quickFacts = source.indexOf('<QuickFactGrid');
  const comparison = source.indexOf('{lookAlikes.length > 0 && (');
  const exactGuide = source.indexOf('<ExactSpeciesGuide', comparison);
  const map = source.indexOf('<DistributionMap', comparison);
  const chart = source.indexOf('<SeasonChart', comparison);
  const groupGuide = source.indexOf('<GroupGuideCard', comparison);

  for (const [label, index] of [
    ['quick facts', quickFacts],
    ['look-alike comparison', comparison],
    ['exact guide', exactGuide],
    ['map', map],
    ['chart', chart],
    ['group guide', groupGuide],
  ]) {
    assert.ok(index >= 0, `${label} is missing`);
  }

  assert.ok(comparison < quickFacts, 'the comparison is safety and must not wait for expert depth');
  assert.ok(comparison < exactGuide, 'the comparison must precede the exact guide');
  assert.ok(comparison < map, 'the comparison must precede the distribution map');
  assert.ok(comparison < chart, 'the comparison must precede the season chart');
  assert.ok(comparison < groupGuide, 'the comparison must precede the group guide');
  assert.match(source.slice(comparison, exactGuide), /item\.description/);
  assert.match(source.slice(comparison, exactGuide), /item\.features/);
  assert.match(source.slice(comparison, exactGuide), /item\.url/);
});

test('nested vendor prose is translated without rewriting identity or raw risk keys', async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = global.fetch;
  const submitted = [];

  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const input = JSON.parse(body.messages[0].content);
    submitted.push(...Object.values(input));

    const translations = {
      pollinator: 'polinizador',
      'Full vendor comparison.': 'Comparacao completa do fornecedor.',
      'pink spores': 'esporos rosados',
      'no ring': 'sem anel',
      deadly: 'mortal',
      'highly venomous': 'altamente venenoso',
    };
    const output = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, translations[value] || value])
    );

    return {
      ok: true,
      json: async () => ({ content: [{ text: JSON.stringify(output) }] }),
    };
  };

  const entity = {
    role: ['pollinator'],
    lookAlikeDetails: [
      {
        name: 'Amanita caesarea',
        scientific: 'Amanita caesarea',
        id: 'look-1',
        entity_id: 'gbif:5240300',
        entityId: 'vendor:2',
        gbif_id: '5240300',
        gbifId: '5240300',
        url: 'https://example.test/look',
        description: 'Full vendor comparison.',
        distinguishing_features: ['pink spores', 'no ring'],
      },
    ],
    edibility: 'deadly',
    danger: ['highly venomous'],
  };

  try {
    const result = await translateEntity(entity, 'pt');
    const lookAlike = result.lookAlikeDetails[0];

    assert.deepEqual(result.role, ['polinizador']);
    assert.equal(lookAlike.description, 'Comparacao completa do fornecedor.');
    assert.deepEqual(lookAlike.distinguishing_features, ['esporos rosados', 'sem anel']);

    assert.equal(lookAlike.name, 'Amanita caesarea');
    assert.equal(lookAlike.scientific, 'Amanita caesarea');
    assert.equal(lookAlike.id, 'look-1');
    assert.equal(lookAlike.entity_id, 'gbif:5240300');
    assert.equal(lookAlike.entityId, 'vendor:2');
    assert.equal(lookAlike.gbif_id, '5240300');
    assert.equal(lookAlike.gbifId, '5240300');
    assert.equal(lookAlike.url, 'https://example.test/look');

    assert.equal(result.edibility, 'deadly');
    assert.equal(result.edibilityLabel, 'mortal');
    assert.deepEqual(result.danger, ['highly venomous']);
    assert.deepEqual(result.dangerLabel, ['altamente venenoso']);

    for (const rawIdentity of [
      'Amanita caesarea',
      'look-1',
      'gbif:5240300',
      'vendor:2',
      '5240300',
      'https://example.test/look',
    ]) {
      assert.ok(!submitted.includes(rawIdentity), `${rawIdentity} must never be sent for translation`);
    }
  } finally {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
    global.fetch = previousFetch;
  }
});

test('sound hides absent prose and labels the public image as a reference', () => {
  const source = read('screens/SoundDetailScreen.js');

  assert.doesNotMatch(source, /overview \|\| t\('sound\.noContentBody'\)/);
  assert.doesNotMatch(source, /text=\{overview \|\|/);
  assert.match(source, /\{readingTopics\.length > 0 && \(/);
  assert.match(source, /\{!!overview && \(/);

  assert.match(source, /detail\.referencePhotoAlt', \{ name: displayName \}/);
  assert.match(source, /styles\.referenceBadge/);
  assert.match(source, /\{t\('detail\.referencePhoto'\)\}/);
});
