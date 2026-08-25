const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const { supportedCodes } = require('./test-locales');

const read = (relative) => fs.readFileSync(path.join(__dirname, relative), 'utf8');

function loadCuratedDetails(getSpeciesDetail) {
  const file = path.join(__dirname, 'components', 'curatedDetails.js');
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const fakeRequire = (name) => {
    if (name === './speciesDetails') return { getSpeciesDetail };
    return require(name);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

test('bird enrichment accepts a curated label fallback only for legacy records', () => {
  const bird = read('screens/BirdDetailScreen.js');
  assert.match(
    bird,
    /const providerTaxon = enrichmentTaxon\(plant\.identityV1,[\s\S]{0,100}scientificName: plant\.scientific/
  );
  assert.match(
    bird,
    /const legacyScientific = plant\.identityV1 === undefined[\s\S]{0,100}\? scientificForBirdLabel\(plant\.name\)[\s\S]{0,30}: null;/
  );
  assert.match(
    bird,
    /const resolvedScientific = providerTaxon\?\.canonicalName \|\| legacyScientific;/
  );
  assert.doesNotMatch(
    bird,
    /const resolvedScientific = plant\.scientific \|\|/,
    'a stored vendor field must not silently authorise external lookups'
  );
  assert.doesNotMatch(bird, /getSpeciesPhoto/, 'the unused duplicate Wikipedia request must stay removed');
  assert.doesNotMatch(bird, /commonName:\s*plant\.name/);
  assert.doesNotMatch(bird, /resolvedScientific \|\| plant\.name/);
  assert.match(bird, /const exactCurated = c\?\.scientific === resolvedScientific \? c : null;/);
  assert.match(bird, /if \(!exactCurated\) \{[\s\S]{0,260}getLocalisedOverview\(\{ scientific: resolvedScientific, language:/);
  assert.match(bird, /const presentation = presentationState\.key === presentationLookupKey/,
    'bird presentation must never reuse another species or language while loading');
  assert.match(bird, /key: presentationLookupKey,[\s\S]{0,100}curated: curatedValue,[\s\S]{0,100}localised: localisedValue/,
    'bird presentation must settle as one keyed snapshot');
  for (const external of [
    /<PlantHero[\s\S]{0,160}scientific=\{resolvedScientific\}/,
    /<IdentificationExtras[\s\S]{0,100}entity=\{\{ \.\.\.plant, scientific: resolvedScientific \}\}[\s\S]{0,100}scientific=\{resolvedScientific\}/,
    /<DistributionMap scientific=\{resolvedScientific\}/,
    /<SeasonChart scientific=\{resolvedScientific\}/,
  ]) {
    assert.match(bird, external);
  }
});

test('exact fish safety is structured and fails closed without prose inference', async () => {
  const calls = [];
  const details = {
    redLionfish: {
      overview: 'This prose mentions venom but is not the detector.',
      riskKey: 'venomous_spines',
      safety: 'Keep clear of the venomous spines.',
    },
    blueTang: {
      riskKey: 'sharp_tail_spine',
      safety: 'The tail spine is scalpel-sharp.',
    },
  };
  const curated = loadCuratedDetails(async (_language, id) => {
    calls.push(id);
    return details[id] || null;
  });

  assert.deepEqual(
    await curated.getCuratedSafety('en', 'fish', 'Pterois volitans (Linnaeus, 1758)'),
    {
      scientific: 'Pterois volitans',
      riskKey: 'venomous_spines',
      riskLevel: 'danger',
      text: 'Keep clear of the venomous spines.',
    }
  );
  assert.equal((await curated.getCuratedSafety('en', 'fish', 'Paracanthurus hepatus')).riskLevel, 'warning');

  const beforeUnknown = calls.length;
  assert.equal(await curated.getCuratedSafety('en', 'fish', 'Lionfish'), null);
  assert.equal(calls.length, beforeUnknown, 'a common name must not even open the detail loader');

  details.redLionfish = { overview: 'Venomous spines. Do not touch.' };
  assert.equal(
    await curated.getCuratedSafety('en', 'fish', 'Pterois volitans'),
    null,
    'dangerous prose without the structured fields must not create an alert'
  );
  details.redLionfish = { riskKey: 'unknown_risk', safety: 'Danger' };
  assert.equal(await curated.getCuratedSafety('en', 'fish', 'Pterois volitans'), null);
  details.redLionfish = { riskKey: 'venomous_spines', safety: '' };
  assert.equal(await curated.getCuratedSafety('en', 'fish', 'Pterois volitans'), null);
});

test('curated fish risk records are localized and precede the gallery', () => {
  const codes = supportedCodes();
  assert.equal(codes.length, 17);
  const english = JSON.parse(read('public/locales/en-species.json')).fishDetails;

  for (const code of codes) {
    const file = `public/locales/${code}-species.json`;
    const fish = JSON.parse(read(file)).fishDetails;
    const riskyIds = Object.entries(fish)
      .filter(([, detail]) => detail.riskKey || detail.safety)
      .map(([id]) => id)
      .sort();
    assert.deepEqual(riskyIds, ['blueTang', 'redLionfish'], `${code}: explicit risk set`);
    assert.equal(fish.blueTang.riskKey, 'sharp_tail_spine', `${code}: blue tang raw key`);
    assert.equal(fish.redLionfish.riskKey, 'venomous_spines', `${code}: lionfish raw key`);
    assert.ok(fish.blueTang.safety.trim(), `${code}: blue tang safety text`);
    assert.ok(fish.redLionfish.safety.trim(), `${code}: lionfish safety text`);
    if (code !== 'en') {
      assert.notEqual(fish.blueTang.safety, english.blueTang.safety, `${code}: no English blue-tang fallback`);
      assert.notEqual(fish.redLionfish.safety, english.redLionfish.safety, `${code}: no English lionfish fallback`);
    }
    const ui = JSON.parse(read(`public/locales/${code}.json`));
    assert.ok(ui.detail.safetySection, `${code}: translated safety heading`);
  }

  const fishScreen = read('screens/FishDetailScreen.js');
  assert.ok(
    fishScreen.indexOf('<ExactSpeciesSafety') < fishScreen.indexOf('<IdentificationExtras'),
    'the complete warning must precede reference and similar-image galleries'
  );
  assert.match(fishScreen, /<ExactSpeciesSafety category="fish" scientific=\{enrichmentScientific\}/);
  assert.match(fishScreen, /enrichmentTaxon\(plant\.identityV1/);

  const alert = read('components/ExactSpeciesSafety.js');
  assert.match(alert, /danger: colors\.error/);
  assert.match(alert, /warning: colors\.warning/);
  assert.match(alert, /<Text style=\{styles\.body\}>\{safety\.text\}<\/Text>/);
  assert.doesNotMatch(alert, /ExpandableText|numberOfLines/, 'a safety warning must never collapse');
});

test('fish without a verified safety record stays explicitly unverified', () => {
  for (const code of supportedCodes()) {
    const ui = JSON.parse(read(`public/locales/${code}.json`));
    assert.ok(ui.fishSafety?.unverifiedTitle?.trim(), `${code}: unverified safety title`);
    assert.ok(ui.fishSafety?.unverifiedBody?.trim(), `${code}: unverified safety guidance`);
  }

  const fishScreen = read('screens/FishDetailScreen.js');
  assert.match(fishScreen, /safetyLookupDone && !safetyRiskLevel/);
  assert.match(fishScreen, /t\('fishSafety\.unverifiedTitle'\)/);
  assert.match(fishScreen, /t\('fishSafety\.unverifiedBody'\)/);
  assert.match(
    fishScreen,
    /celebrationAllowed=\{safetyLookupDone && safetyRiskLevel === 'safe'\}/,
    'unknown safety must never look celebratory'
  );
});

test('localized fauna headlines remain separate from vendor identity', () => {
  const curated = loadCuratedDetails(async () => null);
  const rows = [{ id: 'redLionfish', name: 'Peixe-leao' }];
  assert.equal(curated.curatedDisplayName(rows, 'redLionfish'), 'Peixe-leao');
  assert.equal(curated.curatedDisplayName(rows, 'RedLionfish'), null, 'ids are exact');
  assert.equal(curated.curatedDisplayName([{ id: 'redLionfish', name: '  ' }], 'redLionfish'), null);

  for (const file of ['screens/BirdDetailScreen.js', 'screens/FishDetailScreen.js']) {
    const source = read(file);
    assert.match(source, /const curatedName = curatedDisplayName\(/);
    assert.match(source, /const localisedDisplayName = localised\?\.localised && localised\.title/);
    assert.match(source, /shareEntity\(\{ \.\.\.plant, name: displayName/);
    assert.doesNotMatch(source, /plant\.name\s*=/, `${file}: vendor name must remain immutable`);
  }

  const bird = read('screens/BirdDetailScreen.js');
  assert.match(bird, /const displayName = curatedName \|\| localisedDisplayName \|\| plant\.name/);
  assert.match(bird, /delete stablePlant\.displayName/);
  assert.doesNotMatch(bird, /^\s*displayName,\s*$/m,
    'bird presentation must be reloaded for the active language');

  const fish = read('screens/FishDetailScreen.js');
  assert.match(fish, /const displayName = curatedName \|\| localisedDisplayName \|\| plant\.displayName \|\| plant\.name/);
  assert.match(fish, /saveToCollection\(\{[\s\S]{0,100}\.\.\.plant,[\s\S]{0,80}displayName/);
});
