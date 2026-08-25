const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = __dirname;
const COMPONENT_PATH = path.join(ROOT, 'components', 'AgronomyProfileWizard.js');
const source = fs.readFileSync(COMPONENT_PATH, 'utf8');
const localeCodes = ['en', 'pt', 'es', 'de', 'fr', 'it', 'nl', 'pl', 'sv', 'da', 'cs', 'tr', 'ko', 'zh', 'zh-hant', 'hi', 'ar'];

function leafPaths(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child)
      ? leafPaths(child, next)
      : [next];
  });
}

test('wizard stays standalone and has five explicit, scrollable steps', () => {
  assert.match(source, /const STEP_KEYS = \['purpose', 'location', 'planting', 'soil', 'summary'\]/);
  assert.match(source, /<ScrollView/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.doesNotMatch(source, /CropDetailScreen|App\.js|storage|AsyncStorage/);
});

test('profile uses a manual worldwide ISO location and never infers device position', () => {
  assert.match(source, /countryCode/);
  assert.match(source, /admin1Code/);
  assert.match(source, /locality/);
  assert.match(source, /validAgronomyLocationV2/);
  assert.match(source, /<AgronomyCountryPicker/);
  assert.match(source, /BRAZIL_ADMIN1_CODES\.map/);
  assert.doesNotMatch(source, /STATE_CODES|STATE_CODE_SET/);
  assert.doesNotMatch(source, /expo-location|Geolocation|navigator\.geolocation|getCurrentPosition|requestForegroundPermissions/);
});

test('worldwide country selection is searchable and virtualized instead of a raw ISO field', () => {
  const pickerPath = path.join(ROOT, 'components', 'AgronomyCountryPicker.js');
  const picker = fs.readFileSync(pickerPath, 'utf8');
  assert.match(picker, /ISO_ALPHA2_CODES\.map/);
  assert.match(picker, /new Intl\.DisplayNames/);
  assert.match(picker, /<FlatList/);
  assert.match(picker, /keyboardShouldPersistTaps="handled"/);
  assert.match(picker, /accessibilityRole="radio"/);
  assert.match(picker, /minHeight: control\.minTouch/);
  assert.doesNotMatch(picker, /expo-location|navigator\.geolocation|getCurrentPosition|getLocales/);
});

test('unknown initial data is rejected and V1 is migrated by the shared fail-closed contract', () => {
  assert.match(source, /migrateAgronomyProfileToV2\(value\)/);
  assert.match(source, /AGRONOMY_PROFILE_VERSION/);
  assert.match(source, /PURPOSES\.includes\(source\.purpose\) \? source\.purpose : ''/);
  assert.match(source, /SYSTEMS\.includes\(source\.system\) \? source\.system : ''/);
  assert.match(source, /planting\.stageConfirmed === true/);
  assert.match(source, /typeof soil\.hasReport === 'boolean' \? soil\.hasReport : null/);
  assert.match(source, /isRealIsoDate/);
});

test('save emits only the documented profile and no agronomic calculation', () => {
  assert.match(source, /onSave\(createPayload\(profile\)\)/);
  assert.match(source, /schemaVersion: AGRONOMY_PROFILE_VERSION/);
  assert.match(source, /location: \{[\s\S]*countryCode:[\s\S]*admin1Code:[\s\S]*locality:/);
  assert.match(source, /planting: \{[\s\S]*date:[\s\S]*stage:[\s\S]*stageConfirmed: true/);
  assert.match(source, /soil: \{[\s\S]*description:[\s\S]*hasReport:/);
  assert.doesNotMatch(source, /\bNPK\b|calculateDose|recommendedDose|fertilizerRate|pesticideRate/);
  assert.match(source, /disabled=\{!canSave\}/);
});

test('controls expose accessible semantics and 44px minimum targets', () => {
  assert.match(source, /accessibilityRole="progressbar"/);
  assert.match(source, /accessibilityRole="radiogroup"/);
  assert.match(source, /accessibilityRole="radio"/);
  assert.match(source, /accessibilityRole="checkbox"/);
  assert.match(source, /accessibilityRole="alert"/);
  assert.match(source, /minHeight: control\.minTouch/);
});

test('agronomyProfile namespace is complete in all 17 locales', () => {
  const dictionaries = Object.fromEntries(localeCodes.map((code) => {
    const file = path.join(ROOT, 'public', 'locales', `${code}.json`);
    return [code, JSON.parse(fs.readFileSync(file, 'utf8'))];
  }));
  const expected = leafPaths(dictionaries.en.agronomyProfile).sort();
  assert.ok(expected.length >= 50, 'English agronomyProfile namespace should be substantial');

  for (const code of localeCodes) {
    const namespace = dictionaries[code].agronomyProfile;
    assert.ok(namespace, `${code} is missing agronomyProfile`);
    assert.deepEqual(leafPaths(namespace).sort(), expected, `${code} has incomplete agronomyProfile keys`);
    for (const keyPath of expected) {
      const value = keyPath.split('.').reduce((current, key) => current[key], namespace);
      assert.equal(typeof value, 'string', `${code}:${keyPath} must be text`);
      assert.ok(value.trim().length > 0, `${code}:${keyPath} must not be empty`);
    }
  }
});
