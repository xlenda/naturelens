const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const babel = require('@babel/core');

const ROOT = __dirname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function loadDidacticVisuals() {
  const file = path.join(ROOT, 'components', 'didacticVisuals.js');
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, (name) => {
    if (name.startsWith('../assets/didactic/')) return name;
    return require(name);
  });
  return mod.exports;
}

const CATEGORIES = ['plant', 'tree', 'crop', 'insect', 'mushroom', 'bird', 'fish', 'sound'];
const SCREENS = {
  plant: 'screens/PlantDetailScreen.js',
  tree: 'screens/TreeDetailScreen.js',
  crop: 'screens/CropDetailScreen.js',
  insect: 'screens/InsectDetailScreen.js',
  mushroom: 'screens/MushroomDetailScreen.js',
  bird: 'screens/BirdDetailScreen.js',
  fish: 'screens/FishDetailScreen.js',
  sound: 'screens/SoundDetailScreen.js',
};

test('the eight categories have original, bounded, transparent learning visuals', async () => {
  const manifest = read('components/didacticVisuals.js');
  for (const category of CATEGORIES) {
    assert.match(manifest, new RegExp(`\\b${category}: Object\\.freeze`));
    const assetName = category === 'insect'
      ? 'invertebrate'
      : category === 'mushroom'
      ? 'fungus'
      : category;
    const file = path.join(ROOT, 'assets', 'didactic', `${assetName}.png`);
    const stat = fs.statSync(file);
    assert.ok(stat.size > 20_000, `${category} visual is not a real asset`);
    assert.ok(stat.size < 600_000, `${category} visual is too large for every result screen`);
    const meta = await sharp(file).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
    assert.ok(meta.hasAlpha, `${category} visual must preserve transparency`);
  }
  for (const field of ['scope', 'creator', 'source', 'license', 'reviewedAt']) {
    assert.match(manifest, new RegExp(`${field}:`));
  }
  assert.match(manifest, /scope: 'general'/);
});

test('the learning card separates basic, observation and technical evidence', () => {
  const source = read('components/DidacticFieldGuide.js');
  assert.match(source, /key: 'basic'/);
  assert.match(source, /key: 'learn'/);
  assert.match(source, /key: 'technical'/);
  assert.match(source, /learning\.generalDiagram/);
  assert.match(source, /learning\.generalNote/);
  assert.match(source, /entity\.subjectProbability/);
  assert.match(source, /Number\.isFinite\(entity\.confidence\)/);
  assert.match(source, /textValue\(entity\.scientific\)/);
  assert.match(source, /const \[openPart, setOpenPart\] = useState\(null\)/);
  assert.match(source, /onPress=\{\(\) => setOpenPart\(expanded \? null : key\)\}/);
  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(source, /accessibilityHint=\{detail\}/);
  assert.match(source, /expanded && \{ color: colors\.text \}/);
  assert.match(source, /expanded \? 'chevron-up-outline' : 'chevron-down-outline'/);
  assert.match(source, /scanHint \|\| t\('learning\.observeHint'\)/);
  assert.doesNotMatch(source, /watering|fertili[sz]|edib|treatment/i);
});

test('invertebrate learning follows documented class and never guesses Insecta', async () => {
  const { didacticVisualFor } = loadDidacticVisuals();
  const image = (entity) => didacticVisualFor('insect', entity).image;

  assert.equal(image({ taxonClass: 'Insecta', taxonPhylum: 'Arthropoda' }), '../assets/didactic/invertebrate.png');
  assert.equal(image({ taxonClass: ' Arachnida ' }), '../assets/didactic/arachnid.png');
  assert.equal(image({ taxonClass: 'Gastropoda' }), '../assets/didactic/gastropod.png');
  assert.equal(image({ taxonClass: 'Clitellata' }), '../assets/didactic/annelid.png');
  assert.equal(image({ taxonPhylum: 'Annelida' }), '../assets/didactic/annelid.png');
  assert.equal(image({}), '../assets/didactic/invertebrate.png');

  const unknown = didacticVisualFor('insect', {});
  assert.doesNotMatch(JSON.stringify(unknown.parts), /antennae|wingsLegs/);
  assert.deepEqual(
    didacticVisualFor('insect', { taxonClass: 'Arachnida' }).parts.map((part) => part[1]),
    [
      'learning.parts.cephalothorax',
      'learning.parts.abdomen',
      'learning.parts.eyes',
      'learning.parts.eightLegs',
    ]
  );
  assert.deepEqual(
    didacticVisualFor('insect', { taxonClass: 'Gastropoda' }).parts.map((part) => part[1]),
    [
      'learning.parts.head',
      'learning.parts.tentacles',
      'learning.parts.shell',
      'learning.parts.muscularFoot',
    ]
  );
  assert.deepEqual(
    didacticVisualFor('insect', { taxonPhylum: 'Annelida' }).parts.map((part) => part[1]),
    [
      'learning.parts.anterior',
      'learning.parts.segments',
      'learning.parts.clitellum',
      'learning.parts.posterior',
    ]
  );
  assert.equal(didacticVisualFor('fish', { taxonClass: 'Arachnida' }).image, '../assets/didactic/fish.png');

  for (const asset of ['arachnid', 'gastropod', 'annelid']) {
    const file = path.join(ROOT, 'assets', 'didactic', `${asset}.png`);
    assert.ok(fs.statSync(file).size > 20_000, `${asset} visual is missing`);
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, metadata.height, `${asset} visual must stay square`);
    assert.ok(metadata.hasAlpha, `${asset} visual must preserve transparency`);
  }

  const identify = read('api/identify.js');
  assert.match(identify, /taxonClass: details\.taxonomy\?\.class \|\| null/);
  assert.match(identify, /taxonPhylum: details\.taxonomy\?\.phylum \|\| null/);
  const collection = read('api/collection.js');
  assert.match(collection, /'taxonClass'/);
  assert.match(collection, /'taxonPhylum'/);

  const card = read('components/DidacticFieldGuide.js');
  assert.match(card, /didacticVisualFor\(category, entity\)/);
  assert.match(card, /setOpenPart\(null\)/);
});

test('every result teaches after evidence without hiding the safety zone', () => {
  for (const [category, file] of Object.entries(SCREENS)) {
    const source = read(file);
    assert.match(source, /import DidacticFieldGuide from/);
    assert.match(
      source,
      new RegExp(`<IdentificationExtras[\\s\\S]*?<DidacticFieldGuide\\s+category="${category}"`),
      `${category} must teach only after the evidence deck`
    );
  }

  const plant = read(SCREENS.plant);
  const tree = read(SCREENS.tree);
  const insect = read(SCREENS.insect);
  const mushroom = read(SCREENS.mushroom);
  assert.ok(plant.indexOf('plant.toxicity') < plant.indexOf('<DidacticFieldGuide'));
  assert.ok(tree.indexOf('plant.toxicity') < tree.indexOf('<DidacticFieldGuide'));
  assert.ok(insect.indexOf('dangerDescription') < insect.indexOf('<DidacticFieldGuide'));
  assert.ok(mushroom.indexOf('terms.accuracyBody') < mushroom.indexOf('<DidacticFieldGuide'));
});

test('all locales carry the complete learning vocabulary', () => {
  const localeDir = path.join(ROOT, 'public', 'locales');
  const baseline = JSON.parse(fs.readFileSync(path.join(localeDir, 'en.json'), 'utf8')).learning;
  const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? keys(child, full) : [full];
  });
  const expected = keys(baseline).sort();
  const locales = ['ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pl', 'pt', 'sv', 'tr', 'zh-hant', 'zh'];
  for (const locale of locales) {
    const learning = JSON.parse(fs.readFileSync(path.join(localeDir, `${locale}.json`), 'utf8')).learning;
    assert.ok(learning, `${locale} is missing learning`);
    assert.deepEqual(keys(learning).sort(), expected, `${locale} learning keys differ`);
    for (const value of Object.values(learning.parts)) {
      assert.equal(typeof value, 'string');
      assert.ok(value.trim());
    }
  }
});
