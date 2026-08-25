const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

function loadExpoModule(relativePath) {
  const file = path.join(__dirname, relativePath);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}

const resource = loadExpoModule('components/speciesTopicResource.js');

test.beforeEach(() => resource.clearSpeciesTopicResources());

test('a route and language produce a stable isolated topic-resource key', () => {
  const input = { category: 'insect', language: 'pt-BR', routeKey: 'InsectDetail-42' };
  assert.equal(
    resource.createSpeciesTopicResourceKey(input),
    resource.createSpeciesTopicResourceKey({ ...input })
  );
  assert.notEqual(
    resource.createSpeciesTopicResourceKey(input),
    resource.createSpeciesTopicResourceKey({ ...input, language: 'en' })
  );
  assert.notEqual(
    resource.createSpeciesTopicResourceKey(input),
    resource.createSpeciesTopicResourceKey({ ...input, routeKey: 'InsectDetail-43' })
  );
});

test('a manual opened before enrichment receives later real topics', () => {
  const key = resource.createSpeciesTopicResourceKey({
    category: 'insect',
    language: 'pt',
    routeKey: 'insect-result-1',
  });
  const routeSnapshot = [{ key: 'overview', label: 'Visao geral', text: 'Resumo.' }];
  const observed = [];
  const unsubscribe = resource.subscribeSpeciesTopics(key, (topics) => {
    observed.push(resource.mergeSpeciesTopics(routeSnapshot, topics).map((topic) => topic.key));
  });

  resource.publishSpeciesTopics(key, routeSnapshot);
  resource.publishSpeciesTopics(key, [
    ...routeSnapshot,
    { key: 'lifeStages', label: 'Estagios', text: 'Ovo, larva, pupa e adulto.' },
  ]);

  assert.deepEqual(observed, [
    ['overview'],
    ['overview', 'lifeStages'],
  ]);
  unsubscribe();
});

test('resource topics replace stale copies while route-only group topics survive', () => {
  const fallback = [
    { key: 'overview', label: 'Visao geral', text: 'Antigo.' },
    { key: 'role', label: 'Papel', text: null, groupOnly: true },
  ];
  const live = [
    { key: 'overview', label: 'Visao geral', text: 'Enriquecido.' },
    { key: 'habitat', label: 'Habitat', text: 'Mata.' },
  ];
  const merged = resource.mergeSpeciesTopics(fallback, live);

  assert.deepEqual(merged.map((topic) => topic.key), ['overview', 'habitat', 'role']);
  assert.equal(merged[0].text, 'Enriquecido.');
  assert.equal(merged[2].groupOnly, true);
});

test('structured stage evidence publishes even when the short tab text is unchanged', () => {
  const key = resource.createSpeciesTopicResourceKey({
    category: 'insect', language: 'pt', routeKey: 'insect-stage-1',
  });
  const observed = [];
  const unsubscribe = resource.subscribeSpeciesTopics(key, (topics) => {
    observed.push(topics[0].stageProfile?.larvalInstars || 0);
  });
  const base = { key: 'lifeStages', label: 'Estágios', text: 'Ínstares larvais: 6' };
  resource.publishSpeciesTopics(key, [base]);
  resource.publishSpeciesTopics(key, [{ ...base, stageProfile: { larvalInstars: 6 } }]);
  assert.deepEqual(observed, [0, 6]);
  unsubscribe();
});

test('source attribution publishes even when the visible topic text is unchanged', () => {
  const key = resource.createSpeciesTopicResourceKey({
    category: 'bird', language: 'pt', routeKey: 'bird-source-1',
  });
  const observed = [];
  const unsubscribe = resource.subscribeSpeciesTopics(key, (topics) => {
    observed.push(topics[0].sources?.[0]?.id || 'none');
  });
  const base = { key: 'habitat', label: 'Habitat', text: 'Vive em floresta.' };
  resource.publishSpeciesTopics(key, [base]);
  resource.publishSpeciesTopics(key, [{
    ...base,
    sources: [{
      id: 'wikipedia',
      url: 'https://pt.wikipedia.org/wiki/Species_exemplaris',
      license: 'CC-BY-SA-4.0',
    }],
  }]);
  assert.deepEqual(observed, ['none', 'wikipedia']);
  unsubscribe();
});

test('order-level stage fallback publishes when its structured evidence changes', () => {
  const key = resource.createSpeciesTopicResourceKey({
    category: 'insect', language: 'pt', routeKey: 'insect-order-stage-1',
  });
  const observed = [];
  const unsubscribe = resource.subscribeSpeciesTopics(key, (topics) => {
    observed.push(topics[0].orderStageProfile?.stages.join('>') || 'none');
  });
  const base = { key: 'lifeStages', label: 'Estagios', groupOnly: true };
  resource.publishSpeciesTopics(key, [{
    ...base,
    orderStageProfile: { order: 'Hymenoptera', stages: ['egg', 'larva', 'pupa', 'adult'] },
  }]);
  resource.publishSpeciesTopics(key, [{
    ...base,
    orderStageProfile: { order: 'Hemiptera', stages: ['egg', 'nymph', 'adult'] },
  }]);
  assert.deepEqual(observed, ['egg>larva>pupa>adult', 'egg>nymph>adult']);
  unsubscribe();
});

test('equivalent publications do not rerender subscribers and old idle routes are evicted', () => {
  const firstKey = resource.createSpeciesTopicResourceKey({
    category: 'fish', language: 'pt', routeKey: 'fish-0',
  });
  let notifications = 0;
  const unsubscribe = resource.subscribeSpeciesTopics(firstKey, () => { notifications += 1; });
  resource.publishSpeciesTopics(firstKey, [{ key: 'overview', label: 'Resumo', text: 'Texto.' }]);
  resource.publishSpeciesTopics(firstKey, [{ key: 'overview', label: 'Resumo', text: 'Texto.' }]);
  assert.equal(notifications, 1);
  unsubscribe();

  for (let index = 1; index <= resource.SPECIES_TOPIC_RESOURCE_LIMIT; index += 1) {
    const key = resource.createSpeciesTopicResourceKey({
      category: 'fish', language: 'pt', routeKey: `fish-${index}`,
    });
    resource.publishSpeciesTopics(key, [{ key: 'overview', label: 'Resumo', text: String(index) }]);
  }
  assert.equal(resource.readSpeciesTopics(firstKey), undefined);
});

test('all eight result screens publish and forward their live topic key', () => {
  const screens = {
    plant: 'PlantDetailScreen.js',
    tree: 'TreeDetailScreen.js',
    crop: 'CropDetailScreen.js',
    mushroom: 'MushroomDetailScreen.js',
    insect: 'InsectDetailScreen.js',
    fish: 'FishDetailScreen.js',
    bird: 'BirdDetailScreen.js',
    sound: 'SoundDetailScreen.js',
  };

  for (const [category, file] of Object.entries(screens)) {
    const source = fs.readFileSync(path.join(__dirname, 'screens', file), 'utf8');
    assert.match(source, /createSpeciesTopicResourceKey/);
    assert.match(source, new RegExp(`category: '${category}'`));
    assert.match(source, /routeKey: route\.key/);
    assert.match(source, /usePublishSpeciesTopics\(topicResourceKey, (?:topics|TOPICS)\)/);
    assert.match(source, /navigation\.navigate\('CareTopics',[\s\S]*?topicResourceKey,/);
  }

  const manual = fs.readFileSync(path.join(__dirname, 'screens', 'CareTopicsScreen.js'), 'utf8');
  assert.match(manual, /useSpeciesTopics\(\s*topicResourceKey,/);
  assert.match(manual, /Array\.isArray\(routeTopics\) \? routeTopics : EMPTY_TOPICS/);
});

test('all result screens bind i18n before reading the active language', () => {
  const files = [
    'PlantDetailScreen.js',
    'TreeDetailScreen.js',
    'CropDetailScreen.js',
    'MushroomDetailScreen.js',
    'InsectDetailScreen.js',
    'FishDetailScreen.js',
    'BirdDetailScreen.js',
    'SoundDetailScreen.js',
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, 'screens', file), 'utf8');
    const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
    const unbound = [];
    traverse(ast, {
      ReferencedIdentifier(identifierPath) {
        if (identifierPath.node.name !== 'i18n') return;
        if (!identifierPath.scope.hasBinding('i18n')) {
          unbound.push(identifierPath.node.loc?.start.line || 0);
        }
      },
    });
    assert.deepEqual(unbound, [], `${file} reads an undeclared i18n variable`);
  }
});
