const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const ROOT = __dirname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function inertModule() {
  const callable = () => null;
  return new Proxy(callable, {
    get(_target, key) {
      if (key === '__esModule') return true;
      if (key === 'default') return callable;
      return callable;
    },
  });
}

function loadScreenHelpers(relativePath) {
  const file = path.join(ROOT, relativePath);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const reactNative = {
    View: () => null,
    Text: () => null,
    ScrollView: () => null,
    TouchableOpacity: () => null,
    Linking: {},
    StyleSheet: { create: (styles) => styles },
  };
  const fakeRequire = (name) => {
    if (name === 'react') return require('react');
    if (name === 'react-native') return reactNative;
    return inertModule();
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

test('fish and bird always expose the complete truthful depth without a switcher', () => {
  for (const category of ['Fish', 'Bird']) {
    const source = read(`screens/${category}DetailScreen.js`);
    assert.match(source, /const resultDepth = RESULT_DEPTHS\.EXPERT;/, category);
    assert.doesNotMatch(source, /<ResultDepthSwitcher|useResultDepthPreference/, category);
    assert.match(source, /<ResultDepthLayer activeDepth=\{resultDepth\} depth=\{RESULT_DEPTHS\.EXPERT\}>/, category);
    assert.match(source, /<TopicNavigatorCard[\s\S]*?loading=\{(?:topicsLoading|dossierLoading|\()/, category);
  }
});

test('fish and bird group fallbacks stay explicitly general and do not replace exact topics', () => {
  const fish = loadScreenHelpers('screens/FishDetailScreen.js');
  const bird = loadScreenHelpers('screens/BirdDetailScreen.js');
  const group = {
    topics: {
      safety: { advice: ['Observe sem tocar.'] },
      role: { checklist: ['Registre o habitat.'] },
      uses: { advice: ['Mantenha distancia.'] },
    },
  };
  const translate = (key) => key;

  for (const [name, build, merge] of [
    ['fish', fish.buildFishGroupTopics, fish.mergeFishTopics],
    ['bird', bird.buildBirdGroupTopics, bird.mergeBirdTopics],
  ]) {
    const fallback = build(group, translate);
    assert.deepEqual(fallback.map((topic) => topic.key), ['safety', 'role', 'uses'], name);
    assert.ok(fallback.every((topic) => topic.groupOnly === true && topic.text === null), name);

    const exactSafety = { key: 'safety', label: 'Exact', text: 'Fato confirmado.' };
    const merged = merge([exactSafety], fallback);
    assert.equal(merged.filter((topic) => topic.key === 'safety').length, 1, name);
    assert.equal(merged.find((topic) => topic.key === 'safety'), exactSafety, name);
    assert.deepEqual(merged.map((topic) => topic.key), ['safety', 'role', 'uses'], name);
  }
});

test('candidate birds cannot unlock exact species dossiers through a curated common label', () => {
  const source = read('screens/BirdDetailScreen.js');
  assert.match(source, /const legacyScientific = plant\.identityV1 === undefined/);
  assert.match(source, /const resolvedScientific = providerTaxon\?\.canonicalName \|\| legacyScientific;/);
  assert.match(source, /const exactCurated = c\?\.scientific === resolvedScientific \? c : null;/);
  assert.match(source, /entityName=\{providerTaxon \? displayName : null\}/);
});

test('dossier and localized group loading remain visible in the topic navigator', () => {
  const fish = read('screens/FishDetailScreen.js');
  const bird = read('screens/BirdDetailScreen.js');

  assert.match(fish, /setSpeciesDossier\(enrichmentScientific \? undefined : null\)/);
  assert.match(fish, /speciesDossier === undefined/);
  assert.match(fish, /groupGuideLoading/);

  assert.match(bird, /setBirdDossier\(resolvedScientific \? undefined : null\)/);
  assert.match(bird, /birdDossier === undefined/);
  assert.match(bird, /groupGuideLoading/);
  assert.match(bird, /const groupGuideLookupKey = `\$\{i18n\.language\}\|\$\{guideGroupKey \|\| ''\}`/);
});
