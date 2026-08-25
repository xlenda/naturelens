const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const babel = require('@babel/core');

const ROOT = __dirname;
const SCREEN = path.join(ROOT, 'screens', 'AgronomyWorkspaceScreen.js');
const source = fs.readFileSync(SCREEN, 'utf8');
const localeCodes = ['en', 'pt', 'es', 'de', 'fr', 'it', 'nl', 'pl', 'sv', 'da', 'cs', 'tr', 'ko', 'zh', 'zh-hant', 'hi', 'ar'];

function leafPaths(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child)
      ? leafPaths(child, next)
      : [next];
  });
}

test('workspace is a standalone full-screen scene with three accessible tabs', () => {
  assert.match(source, /<SafeAreaView[\s\S]+<NatureScene[\s\S]+<TopBar/);
  assert.match(source, /const TABS = Object\.freeze\(\['essential', 'learn', 'agronomist'\]\)/);
  assert.match(source, /accessibilityRole="tablist"/);
  assert.match(source, /accessibilityRole="tab"/);
  assert.match(source, /<ScrollView/);
  assert.match(source, /minHeight: control\.minTouch/);
  assert.doesNotMatch(source, /App\.js|CropDetailScreen|TwoRowTabBar/);
});

test('profile and append-only events use the agronomy storage contract', () => {
  for (const name of [
    'agronomySubjectKey',
    'getAgronomyProfile',
    'saveAgronomyProfile',
    'getAgronomyEvents',
    'appendAgronomyEvent',
  ]) assert.match(source, new RegExp(`\\b${name}\\b`));
  assert.match(source, /if \(!storedProfile\)[\s\S]+setProfileError\('saveFailed'\)/);
  assert.match(source, /if \(!storedEvent\)[\s\S]+setEventError\('saveFailed'\)/);
  assert.match(source, /setEvents\(\(current\) => \[storedEvent,/);
  assert.doesNotMatch(source, /removeAgronomyEvent|deleteAgronomyEvent|updateAgronomyEvent/);
});

test('workspace renders the worldwide V2 location instead of legacy Brazil-only fields', () => {
  assert.match(source, /import \{ agronomyLocationLabel \} from ['"]\.\.\/components\/agronomyProfileV2['"]/);
  assert.match(source, /value: agronomyLocationLabel\(profile\.location\) \|\| null/);
  assert.doesNotMatch(source, /profile\.location\?\.municipality && profile\.location\?\.state/);
});

test('event form keeps only stable types and validates optional value and unit', () => {
  assert.match(source, /'observation',[\s\S]+'stage',[\s\S]+'rain',[\s\S]+'irrigation',[\s\S]+'fertilization',[\s\S]+'pestSample',[\s\S]+'diseaseCheck',[\s\S]+'harvest'/);
  assert.match(source, /AGRONOMY_EVENT_TYPES\.includes\(type\)/);
  assert.match(source, /optionalAmount\(eventAmount\)/);
  assert.match(source, /unitWithoutAmount/);
  assert.match(source, /accessibilityRole="radiogroup"/);
  assert.match(source, /accessibilityRole="radio"/);
});

test('wizard is isolated in an accessible modal and saves before success', () => {
  assert.match(source, /<Modal[\s\S]+accessibilityViewIsModal=\{true\}[\s\S]+<AgronomyProfileWizard/);
  assert.match(source, /await saveAgronomyProfile/);
  assert.ok(
    source.indexOf('await saveAgronomyProfile') < source.indexOf("setProfileMessage('saved')"),
    'profile success must follow persistence'
  );
  assert.ok(
    source.indexOf('await appendAgronomyEvent') < source.indexOf("setEventMessage('saved')"),
    'event success must follow persistence'
  );
});

test('advanced modules and official sources fail closed at exact resolvers', () => {
  assert.match(source, /getCropAgronomyProfile\(scientific\)/);
  assert.match(source, /resolveAgronomyWorkspace\(entity, profile\)/);
  assert.match(source, /workspaceResolution\?\.state === AGRONOMY_STATUS\.TECHNICAL_GUIDE/);
  assert.match(source, /entity\?\.healthAssessed === false/);
  assert.match(source, /entity\.id === cropCoverage\?\.catalogId/);
  assert.doesNotMatch(source, /identityV1 === undefined \|\| entity\?\.identityV1\?\.status === 'exact'/);
  assert.match(source, /agronomyRouting === 'exact'/);
  assert.match(source, /getFertilizerProfile\(\{ scientific, groupKey \}\)/);
  assert.match(source, /getPestManagementProfile\(\{ scientific, groupKey \}\)/);
  assert.match(source, /\{pestResolution \? \([\s\S]+<PestManagementTablesCard/);
  assert.match(source, /\{fertilizerResolution \? \([\s\S]+<FertilizerTablesCard/);
  assert.match(source, /getCropAgronomySource/);
  assert.match(source, /accessibilityRole="link"/);
  assert.match(source, /reference\.supports\.some\(\(moduleKey\) => currentModules\.includes\(moduleKey\)\)/);
  assert.doesNotMatch(source, /source\.label/);
  assert.doesNotMatch(source, /calculateDose|recommendedDose|fertilizerRate|applicationRate|ruleFixtures/);
});

test('worldwide evidence is exact, language-keyed and remains outside regional tables', () => {
  assert.match(source, /hasExactCropIdentity\(entity, scientific\)/);
  assert.match(source, /globalAgronomyDossierKey\(i18n\.language, scientific\)/);
  assert.match(source, /globalDossierState\.key === globalDossierLookupKey/);
  assert.match(source, /verifiedGlobalCropDossier\(entity, scientific, keyedGlobalDossier\)/);
  assert.match(source, /getSpeciesDossier\(\{[\s\S]+category: 'crop',[\s\S]+language: i18n\.language/);
  assert.match(source, /activeTab !== 'agronomist'/);
  assert.match(source, /buildSourceGroundedTopics\(\{ dossier: globalDossier \}\)/);
  assert.match(source, /usePublishSpeciesTopics\(globalTopicResourceKey, globalTopics\)/);
  assert.match(source, /<GlobalAgronomyEvidenceCard[\s\S]+topics=\{globalTopics\}/);

  const globalEvidence = source.indexOf('<GlobalAgronomyEvidenceCard');
  const regionalPests = source.indexOf('<PestManagementTablesCard', globalEvidence);
  const regionalFertilizer = source.indexOf('<FertilizerTablesCard', globalEvidence);
  assert.ok(globalEvidence >= 0 && regionalPests > globalEvidence && regionalFertilizer > globalEvidence);
});

test('expanded visual lessons announce their body and worldwide network waits for its tab', () => {
  assert.match(source, /const body = t\(`agronomyWorkspace\.learning\.visuals\.\$\{topic\.key\}\.body`\)/);
  assert.match(source, /accessibilityLabel=\{expanded \? `\$\{title\}\. \$\{body\}` : title\}/);
  assert.match(source, /activeTab !== 'agronomist'/);
});

test('learning turns five agronomy topics into honest tappable visual lessons', () => {
  assert.match(source, /function LearningFallback/);
  assert.match(source, /didacticVisualFor\('crop'\)/);
  assert.match(source, /source=\{CROP_DIDACTIC_VISUAL\.image\}/);
  assert.match(source, /learning\.generalDiagram/);
  assert.match(source, /learning\.generalNote/);
  assert.match(source, /const VISUAL_TOPICS = Object\.freeze/);
  for (const topic of ['phenology', 'soil', 'water', 'nutrition', 'mip']) {
    assert.match(source, new RegExp(`key: '${topic}'`));
  }
  assert.match(source, /VISUAL_TOPICS\.map/);
  assert.match(source, /<VisualDiagram topic=\{topic\.key\} profile=\{profile\}/);
  assert.match(source, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(source, /LEARNING_STEPS\.map/);
  assert.doesNotMatch(source, /from ['"]\.\.\/components\/AgronomyVisualGuide['"]/);
});

test('planning references stay separate from released technical modules', () => {
  assert.match(source, /const planningSources = useMemo/);
  assert.match(source, /!reference\.supports\.some\(\(moduleKey\) => currentModules\.includes\(moduleKey\)\)/);
  assert.match(source, /agronomyWorkspace\.planningSourcesTitle/);
  assert.match(source, /agronomyWorkspace\.planningSourcesBody/);
  assert.match(source, /planningSources\.map/);
});

test('empty observations and values without units fail closed', () => {
  assert.match(source, /const emptyEvent = eventNote\.trim\(\)\.length === 0 && amountState\.amount === null/);
  assert.match(source, /if \(amountWithoutUnit\)[\s\S]+setEventError\('unitRequired'\)/);
  assert.match(source, /if \(emptyEvent\)[\s\S]+setEventError\('emptyEvent'\)/);
});

test('workspace compiles for Expo', () => {
  assert.doesNotThrow(() => babel.transformFileSync(SCREEN, { presets: ['babel-preset-expo'] }));
});

test('agronomyWorkspace namespace is complete in all 17 locales', () => {
  const dictionaries = Object.fromEntries(localeCodes.map((code) => {
    const file = path.join(ROOT, 'public', 'locales', `${code}.json`);
    return [code, JSON.parse(fs.readFileSync(file, 'utf8'))];
  }));
  const expected = leafPaths(dictionaries.en.agronomyWorkspace).sort();
  assert.ok(expected.length >= 50, 'English agronomyWorkspace namespace should be substantial');
  for (const code of localeCodes) {
    const namespace = dictionaries[code].agronomyWorkspace;
    assert.ok(namespace, `${code} is missing agronomyWorkspace`);
    assert.deepEqual(leafPaths(namespace).sort(), expected, `${code} has incomplete workspace keys`);
    for (const keyPath of expected) {
      const value = keyPath.split('.').reduce((current, key) => current[key], namespace);
      assert.equal(typeof value, 'string', `${code}:${keyPath} must be text`);
      assert.ok(value.trim(), `${code}:${keyPath} must not be empty`);
    }
  }
});
