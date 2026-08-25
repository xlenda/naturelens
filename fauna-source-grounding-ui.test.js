const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const ROOT = __dirname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const SCREENS = [
  {
    category: 'fish',
    file: 'screens/FishDetailScreen.js',
    dossier: 'speciesDossier',
    merge: 'mergeFishTopics',
  },
  {
    category: 'bird',
    file: 'screens/BirdDetailScreen.js',
    dossier: 'birdDossier',
    merge: 'mergeBirdTopics',
  },
  {
    category: 'insect',
    file: 'screens/InsectDetailScreen.js',
    dossier: 'speciesDossier',
    merge: 'mergeInsectTopics',
  },
];

test('fish, bird and insect publish source-grounded sections before group fallbacks', () => {
  for (const { category, file, dossier, merge } of SCREENS) {
    const source = read(file);
    assert.match(
      source,
      /buildSourceGroundedTopics,\s*mergeSourceGroundedTopics,[\s\S]*?from '\.\.\/components\/sourceGroundedTopics';/,
      `${category}: imports the grounded topic bridge`
    );
    assert.match(
      source,
      new RegExp(`const sourceTopics = buildSourceGroundedTopics\\(\\{[\\s\\S]*?dossier: ${dossier},[\\s\\S]*?labels: \\{`),
      `${category}: consumes wikiSections from its validated dossier`
    );
    assert.match(
      source,
      new RegExp(`const topics = ${merge}\\(\\s*mergeSourceGroundedTopics\\(speciesTopics, sourceTopics\\),`),
      `${category}: exact sourced facts precede the explicitly general group manual`
    );
  }
});

test('canonical fauna labels use the existing 17-locale vocabulary', () => {
  const fish = read('screens/FishDetailScreen.js');
  const bird = read('screens/BirdDetailScreen.js');
  const insect = read('screens/InsectDetailScreen.js');

  for (const source of [fish, bird, insect]) {
    assert.match(source, /feeding: t\('speciesDossier\.diet'\)/);
    assert.match(source, /reproduction: t\('speciesDossier\.reproduction'\)/);
    assert.match(source, /lifeCycle: t\('speciesDossier\.lifeCycle'\)/);
    assert.match(source, /habitat: t\('fieldGuide\.habitat'\)/);
    assert.match(source, /ecology: t\('detail\.ecologicalRoleSection'\)/);
    assert.match(source, /conservation: t\('detail\.conservationStatus'\)/);
  }
  assert.match(fish, /behavior: t\('observationWorkspace\.eventTypes\.fish\.behavior'\)/);
  assert.match(bird, /behavior: t\('observationWorkspace\.eventTypes\.bird\.behavior'\)/);
  assert.match(bird, /vocalization: t\('observationWorkspace\.eventTypes\.bird\.vocalization'\)/);
  assert.match(insect, /behavior: t\('observationWorkspace\.eventTypes\.insect\.behavior'\)/);
});

test('every canonical fauna label exists in all 17 supported locale files', () => {
  const languages = [
    'en', 'pt', 'es', 'de', 'fr', 'it', 'nl', 'pl', 'sv',
    'da', 'cs', 'tr', 'ko', 'zh', 'zh-hant', 'hi', 'ar',
  ];
  const keys = [
    'speciesDossier.diet',
    'speciesDossier.reproduction',
    'speciesDossier.lifeCycle',
    'fieldGuide.habitat',
    'detail.ecologicalRoleSection',
    'detail.conservationStatus',
    'observationWorkspace.eventTypes.insect.behavior',
    'observationWorkspace.eventTypes.fish.behavior',
    'observationWorkspace.eventTypes.bird.behavior',
    'observationWorkspace.eventTypes.bird.vocalization',
  ];

  for (const language of languages) {
    const locale = JSON.parse(read(`public/locales/${language}.json`));
    for (const key of keys) {
      const value = key.split('.').reduce((current, part) => current?.[part], locale);
      assert.equal(typeof value, 'string', `${language}: ${key}`);
      assert.ok(value.trim(), `${language}: ${key} must not be empty`);
    }
  }
});

test('the three integrated detail screens compile with Expo Babel', () => {
  for (const { category, file } of SCREENS) {
    assert.doesNotThrow(
      () => babel.transformFileSync(path.join(ROOT, file), { presets: ['babel-preset-expo'] }),
      `${category}: Babel compilation`
    );
  }
});
