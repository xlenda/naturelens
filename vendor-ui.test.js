const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing section: ${start}`);
  return source.slice(from, to);
}

function loadTechnicalText(source, file) {
  const match = source.match(/function technicalText\(value\) \{([\s\S]*?)\n\}/);
  assert.ok(match, `${file}: technicalText helper is missing`);
  return new Function('value', match[1]);
}

function loadPureFunction(source, file, name, args) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${file}: ${name} helper is missing`);
  return new Function(...args, match[1]);
}

test('crop keeps vendor fields authoritative and only shows a real health assessment', () => {
  const source = read('screens/CropDetailScreen.js');
  const save = section(source, 'const toggleSave =', 'const handleShare =');

  assert.match(source, /const resolvedOverview = plant\.overview \|\| curated\?\.overview \|\| null;/);
  assert.match(source, /const hasHealthAssessment = plant\.healthAssessed === true;/);
  assert.match(save, /saveToCollection\(plant\)/);
  assert.doesNotMatch(save, /overview\s*:/, 'curated prose must not replace the vendor entity on save');
});

test('bird and sound keep language-sensitive prose out of the stable collection entity', () => {
  const bird = read('screens/BirdDetailScreen.js');
  const sound = read('screens/SoundDetailScreen.js');
  const birdSave = section(bird, 'const toggleSave =', 'const handleShare =');
  const soundSave = section(sound, 'const toggleSave =', 'const groupLabelKey =');

  assert.match(
    bird,
    /const resolvedOverview = curated\?\.overview \|\| localised\?\.text \|\| null;/
  );
  assert.match(
    sound,
    /const overview = curated\?\.overview \|\| info\?\.extract \|\| null;/
  );
  assert.match(bird, /const displayName = curatedName \|\| localisedDisplayName \|\| plant\.name;/);
  assert.match(sound, /const displayName =[\s\S]*info\?\.title[\s\S]*\? info\.title : plant\.name/);
  for (const [name, save] of [['bird', birdSave], ['sound', soundSave]]) {
    assert.doesNotMatch(save, /^\s*displayName,\s*$/m, `${name}: translated title must be reloaded per language`);
    assert.doesNotMatch(save, /^\s*(?:overview|overview: resolvedOverview),\s*$/m,
      `${name}: translated prose must be reloaded per language`);
  }
  assert.doesNotMatch(sound, /patch\.(?:displayName|overview)/);
  assert.doesNotMatch(bird, /patch\.(?:displayName|overview)/);
});

test('technical receipts are conditional and accept only renderable strings', () => {
  const files = [
    'screens/PlantDetailScreen.js',
    'screens/TreeDetailScreen.js',
    'screens/InsectDetailScreen.js',
    'screens/MushroomDetailScreen.js',
    'screens/CropDetailScreen.js',
  ];

  const taxonomy = read('components/TaxonomyTrail.js');
  assert.match(taxonomy, /t\('detail\.family'\)/);
  assert.match(taxonomy, /t\('detail\.order'\)/);
  assert.match(taxonomy, /if \(nodes\.length < 2\) return null/);

  for (const file of files) {
    const source = read(file);
    const technicalText = loadTechnicalText(source, file);

    assert.match(source, /<TaxonomyTrail/, `${file}: taxonomy trail missing`);
    assert.match(source, /t\('detail\.synonyms'\)/, `${file}: synonyms row missing`);
    assert.match(source, /infoRows\.length > 0/, `${file}: empty receipt must stay hidden`);

    assert.equal(technicalText('  Rosaceae  '), 'Rosaceae');
    assert.equal(technicalText([' Rosaceae ', null, 'Rosa']), 'Rosaceae, Rosa');
    assert.equal(technicalText([' ', null, { label: 'unsafe' }]), null);
    assert.equal(technicalText({ category: 'LC' }), null);
  }
});

test('structured red-list metadata can never become a React child', () => {
  const source = read('screens/InsectDetailScreen.js');
  const { insectRedListLabel } = require('./components/insectRedList');
  assert.equal(
    insectRedListLabel({ category: 'LC' }, (key) => (
      key === 'detail.iucn.leastConcern' ? 'Pouco preocupante' : key
    )),
    'Pouco preocupante'
  );
  assert.equal(insectRedListLabel({ category: 'unknown' }, (key) => key), null);
  assert.match(source, /value: conservationLabel/);
  assert.match(source, /insectRedListLabel\(plant\.redList, t\)/);
  assert.doesNotMatch(source, /value:\s*plant\.redList/);
});

test('insect vendor arrays fail closed without crashing or leaking raw English', () => {
  const file = 'screens/InsectDetailScreen.js';
  const source = read(file);
  const normalise = loadPureFunction(source, file, 'normaliseInsectTextList', ['value']);
  const readerSafe = loadPureFunction(
    source,
    file,
    'readerSafeInsectText',
    ['value', 'language', 'resultLanguage']
  );

  assert.deepEqual(normalise(' pollinator '), ['pollinator']);
  assert.deepEqual(normalise([' pollinator ', null, { unsafe: true }, ' predator ']), ['pollinator', 'predator']);
  assert.deepEqual(normalise({ unsafe: true }), []);
  assert.deepEqual(normalise(null), []);

  assert.equal(readerSafe('pollinator', 'pt-BR', 'pt'), null);
  assert.equal(readerSafe('This insect may sting', 'pt-BR', 'pt'), null);
  assert.equal(readerSafe('polinizador', 'pt-BR', 'pt'), 'polinizador');
  assert.equal(readerSafe('polinizador', 'pt-BR', 'en'), null);
  assert.equal(readerSafe('highly venomous', 'en', 'en'), 'highly venomous');

  assert.doesNotMatch(
    source,
    /plant\.(?:danger|dangerLabel|role)(?:\?\.)?\.(?:some|map|join)\(/,
    'untrusted vendor fields must never receive array methods directly'
  );
  assert.match(source, /const dangerColor = rawDanger\.some\(/,
    'the raw risk key must still decide the warning colour');
  assert.match(source, /candidate\.toLocaleLowerCase\(\) === raw\.toLocaleLowerCase\(\)/,
    'an untranslated label copy must never become visible text');
  assert.match(source, /const safetyFallback = hasDanger[\s\S]*t\('lensReveal\.safetyFirst'\)/,
    'a hidden raw label must leave a localised, non-empty safety card');
});

test('vendor prose keeps its provider and licence attached in every Kindwise result', () => {
  const credit = read('components/VendorSourceCredit.js');
  assert.match(credit, /detail\.speciesCareSource/);
  assert.match(credit, /cleanProvider/);
  assert.match(credit, /licenseName/);
  assert.match(credit, /accessibilityRole="link"/);

  for (const file of [
    'screens/PlantDetailScreen.js',
    'screens/TreeDetailScreen.js',
    'screens/InsectDetailScreen.js',
    'screens/MushroomDetailScreen.js',
    'screens/CropDetailScreen.js',
  ]) {
    const source = read(file);
    assert.match(source, /<VendorSourceCredit\b/, `${file}: vendor credit is missing`);
    assert.match(source, /provider=\{plant\.sourceProvider\}/, `${file}: provider is missing`);
    assert.match(source, /citation=\{plant\.overviewCitation\}/, `${file}: citation is missing`);
    assert.match(source, /licenseName=\{plant\.overviewLicense\}/, `${file}: licence is missing`);
  }
});

test('missing confidence stays absent and rich mushroom comparisons survive the UI', () => {
  const extras = read('components/IdentificationExtras.js');
  const mushroom = read('screens/MushroomDetailScreen.js');

  assert.match(extras, /Number\.isFinite\(alt\.confidence\)/);
  assert.doesNotMatch(extras, /accessibilityLabel=\{`\$\{alt\.name\}, \$\{alt\.confidence\}%`\}/);
  assert.match(mushroom, /plant\.lookAlikeDetails/);
  assert.match(mushroom, /item\?\.distinguishing_features/);
  assert.match(mushroom, /item\.description/);
  assert.match(mushroom, /item\.url/);
});

test('Meu Registro prioritises the localised sound label without losing the vendor label', () => {
  const specimen = read('screens/SpecimenScreen.js');
  assert.match(specimen, /const identityName = entry\.displayName \|\| entry\.name \|\| entry\.scientific/);
  assert.match(specimen, /const secondaryName = entry\.nickname[\s\S]*entry\.displayName && entry\.name !== entry\.displayName/);
});
