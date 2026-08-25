const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const read = (relative) => fs.readFileSync(path.join(__dirname, relative), 'utf8');

function loadExpoModule(relativePath) {
  const file = path.join(__dirname, relativePath);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}

const BOTANICAL_SCREENS = [
  ['plant', 'screens/PlantDetailScreen.js'],
  ['tree', 'screens/TreeDetailScreen.js'],
  ['crop', 'screens/CropDetailScreen.js'],
];

test('botanical results always mount the complete truthful dossier', () => {
  for (const [category, file] of BOTANICAL_SCREENS) {
    const source = read(file);
    assert.match(source, /const resultDepth = RESULT_DEPTHS\.EXPERT;/, category);
    assert.doesNotMatch(source, /<ResultDepthSwitcher|useResultDepthPreference/, category);
    assert.match(source, /depth=\{RESULT_DEPTHS\.EXPERT\}/, category);
  }

  for (const file of ['screens/PlantDetailScreen.js', 'screens/TreeDetailScreen.js']) {
    const source = read(file);
    assert.match(source, /defaultExpanded=\{resultDepth === RESULT_DEPTHS\.EXPERT\}/, file);
    assert.match(source, /<ExpandableText/, file);
  }
});

test('plant and tree keep candidate taxonomy only in the general guide identity', () => {
  for (const [category, file] of BOTANICAL_SCREENS.slice(0, 2)) {
    const source = read(file);
    const guideStart = source.indexOf('const groupGuideEntity = {');
    const guideEnd = source.indexOf('};', guideStart);
    const guide = source.slice(guideStart, guideEnd);

    assert.ok(guideStart >= 0, file);
    assert.match(guide, new RegExp(`category: '${category}'`), file);
    assert.match(guide, /scientific: enrichmentScientific/, file);
    assert.match(guide, /family: plant\.family \|\| null/, file);
    assert.match(guide, /ord: plant\.ord \|\| null/, file);
    assert.match(source, /getSpeciesGroup\(groupGuideEntity\)/, file);
    assert.doesNotMatch(source, /scientific: null, family: null, ord: null/, file);
    assert.match(source, /getGroups\(i18n\.language\)/, file);
    assert.match(source, /availableGroupTopicKeys\(groups, groupKey\)/, file);
    assert.match(source, /topics\.push\(\{ key, label: t\(definition\.labelKey\), groupOnly: true \}\)/, file);
    assert.match(source, /loading=\{groupTopicsLoading \|\| speciesDossierLoading\}/, file);

    assert.match(source, /scientific=\{enrichmentScientific\}/, file);
    assert.match(source, /expectedSpecies = canonicalBinomial\(enrichmentScientific\)/, file);
    assert.match(source, /<DistributionMap[^>]+identityV1=\{plant\.identityV1\}/, file);
    assert.match(source, /<SeasonChart[^>]+identityV1=\{plant\.identityV1\}/, file);
  }
});

test('botanical family fallback stays general and crop protocols stay exact', () => {
  const { getSpeciesGroup } = loadExpoModule('components/speciesGroup.js');

  assert.equal(getSpeciesGroup({ category: 'plant', family: 'Cactaceae' }), 'succulent');
  assert.equal(getSpeciesGroup({ category: 'tree', family: 'Fagaceae' }), 'woody');
  assert.equal(getSpeciesGroup({ category: 'tree', family: 'Rosaceae' }), null);
  assert.equal(getSpeciesGroup({ category: 'crop', family: 'Poaceae' }), null);
  assert.equal(getSpeciesGroup({ category: 'crop', scientific: 'Zea mays' }), 'grainCrop');

  const groups = JSON.parse(read('public/locales/pt-groups.json'));
  for (const [groupKey, expectedKeys] of [
    ['succulent', ['watering', 'light', 'soil', 'safety']],
    ['woody', ['watering', 'soil', 'uses']],
  ]) {
    for (const key of expectedKeys) {
      const topic = groups[groupKey]?.topics?.[key];
      assert.ok(topic, `${groupKey}/${key}`);
      assert.ok((topic.advice || []).length + (topic.checklist || []).length > 0, `${groupKey}/${key}`);
    }
  }

  const crop = read('screens/CropDetailScreen.js');
  assert.match(crop, /getCuratedDetail\(i18n\.language, 'crop', enrichmentScientific\)/);
  assert.match(crop, /getPestManagementProfile\(\{ scientific: enrichmentScientific, groupKey \}\)/);
  assert.match(crop, /<FertilizerTablesCard[\s\S]+scientific=\{enrichmentScientific\}/);
  assert.doesNotMatch(crop, /getSpeciesGroup\(plant\)/);
});

test('crop distinguishes exact-curation loading from confirmed absence', () => {
  const crop = read('screens/CropDetailScreen.js');
  assert.match(crop, /const curatedLookupKey = `\$\{i18n\.language\}\|\$\{enrichmentScientific \|\| ''\}`/);
  assert.match(crop, /useState\(\{ key: null, detail: null \}\)/);
  assert.match(crop, /curatedState\.key === curatedLookupKey \? curatedState\.detail : null/);
  assert.match(crop, /curatedState\.key !== curatedLookupKey/);
  assert.match(crop, /if \(!enrichmentScientific\) return/);
  assert.match(crop, /setCuratedState\(\{ key: curatedLookupKey, detail \}\)/);
  assert.match(crop, /setCuratedState\(\{ key: curatedLookupKey, detail: null \}\)/);
  assert.match(crop, /<TopicNavigatorCard[\s\S]+loading=\{curatedLoading \|\| speciesDossierLoading\}/);
});

test('botanical Wikipedia enrichment is exact, keyed and source grounded', () => {
  for (const [category, file] of BOTANICAL_SCREENS) {
    const source = read(file);
    const requestStart = source.indexOf('getSpeciesDossier({');
    const requestEnd = source.indexOf('}).then(', requestStart);
    const request = source.slice(requestStart, requestEnd);

    assert.ok(requestStart >= 0, file);
    assert.match(request, /apiBase: API_BASE/, file);
    assert.match(request, new RegExp(`category: '${category}'`), file);
    assert.match(request, /scientific: enrichmentScientific/, file);
    assert.doesNotMatch(request, /scientific: plant\.scientific/, file);
    assert.match(request, /language: i18n\.language/, file);

    assert.match(
      source,
      new RegExp(`const dossierLookupKey = \`${category}\\|\\$\\{i18n\\.language\\}\\|\\$\\{enrichmentScientific \\|\\| ''\\}\``),
      file
    );
    assert.match(source, /speciesDossierState\.key === dossierLookupKey/, file);
    assert.match(source, /speciesDossierState\.key !== dossierLookupKey/, file);
    assert.match(source, /if \(!enrichmentScientific\) return/, file);
    assert.match(source, /setSpeciesDossierState\(\{ key: dossierLookupKey, dossier \}\)/, file);
    assert.match(source, /setSpeciesDossierState\(\{ key: dossierLookupKey, dossier: null \}\)/, file);
    assert.match(source, /buildSourceGroundedTopics\(\{ dossier: speciesDossier \}\)/, file);
    assert.match(source, /mergeSourceGroundedTopics\(baseTopics, sourceTopics\)/, file);
    assert.match(source, /loading=\{[^}]*speciesDossierLoading[^}]*\}/, file);
  }

  const crop = read('screens/CropDetailScreen.js');
  assert.match(crop, /\{ key: 'uses',[^\n]+plant\.commonUses/);
  assert.doesNotMatch(crop, /\{ key: 'commonUses',[^\n]+plant\.commonUses/);
});
