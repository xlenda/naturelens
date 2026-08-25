const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  ACTIONS,
  clearIpmCache,
  getIpmDossier,
  getSupportedIpmCrops,
  normaliseCropList,
  normaliseIpmDossier,
  requestJson,
} = require('./components/ipmDossier');
const api = require('./api/ipm-dossier');

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

test('client accepts only exact crop lists and exact profile identity', () => {
  assert.deepEqual(normaliseCropList({
    insectScientific: 'Tuta absoluta', crops: ['Solanum lycopersicum', 'Zea mays', 'bad'],
  }, 'Tuta absoluta'), ['Solanum lycopersicum']);
  assert.equal(normaliseCropList({ insectScientific: 'Tuta absoluta', crops: [] }, 'Spodoptera frugiperda'), null);

  const source = api.exactProfile('Tuta absoluta', 'Solanum lycopersicum');
  assert.ok(normaliseIpmDossier(source, 'Tuta absoluta', 'Solanum lycopersicum'));
  assert.equal(normaliseIpmDossier(source, 'Tuta absoluta', 'Zea mays'), null);
});

test('unrecognised actions, thresholds and source hosts cannot reach the UI', () => {
  const value = structuredClone(api.exactProfile('Spodoptera frugiperda', 'Zea mays'));
  value.prevention.push('recommendSecretDose');
  value.thresholds.push({ id: 'invented', labelKey: 'invented', actionPercent: 99 });
  value.sources.push({ id: 'agrofit', url: 'https://attacker.test/fake', license: 'CC-BY-ND-3.0' });
  const clean = normaliseIpmDossier(value, 'Spodoptera frugiperda', 'Zea mays');

  assert.equal(clean.prevention.includes('recommendSecretDose'), false);
  assert.equal(clean.thresholds.length, 1);
  assert.equal(clean.sources.some((source) => source.url.includes('attacker.test')), false);

  const crossPairCitation = structuredClone(api.exactProfile('Spodoptera frugiperda', 'Zea mays'));
  crossPairCitation.sources.push(api.SOURCES.embrapaSoyLooper);
  assert.deepEqual(
    normaliseIpmDossier(crossPairCitation, 'Spodoptera frugiperda', 'Zea mays').sources
      .map((source) => source.id),
    ['embrapa-maize', 'agrofit']
  );

  const crossPairAction = structuredClone(api.exactProfile('Spodoptera frugiperda', 'Zea mays'));
  crossPairAction.monitoring.push('inspectLowerCanopy');
  assert.equal(normaliseIpmDossier(
    crossPairAction,
    'Spodoptera frugiperda',
    'Zea mays'
  ).monitoring.includes('inspectLowerCanopy'), false);

  const wrongCitation = structuredClone(api.exactProfile('Spodoptera frugiperda', 'Zea mays'));
  wrongCitation.sources = wrongCitation.sources.filter((source) => source.id !== 'embrapa-maize');
  assert.equal(normaliseIpmDossier(
    wrongCitation,
    'Spodoptera frugiperda',
    'Zea mays'
  ), null);

  const inventedSoyThreshold = structuredClone(api.exactProfile('Euschistus heros', 'Glycine max'));
  inventedSoyThreshold.thresholds = [{
    id: 'initial-symptoms-high-yield', labelKey: 'initialSymptomsHighYieldThreshold',
    samplePoints: 5, sampleAreaHa: 1, actionPercent: 10, minimumYieldBagsPerHa: 100,
  }];
  assert.deepEqual(normaliseIpmDossier(
    inventedSoyThreshold,
    'Euschistus heros',
    'Glycine max'
  ).thresholds, []);
});

test('expanded pairs and the maize applicability survive only their exact contracts', () => {
  const expanded = [
    ['Dalbulus maidis', 'Zea mays'],
    ['Bemisia tabaci', 'Phaseolus vulgaris'],
    ['Anthonomus grandis', 'Gossypium hirsutum'],
    ['Hypothenemus hampei', 'Coffea arabica'],
    ['Chrysodeixis includens', 'Glycine max'],
    ['Anticarsia gemmatalis', 'Glycine max'],
  ];
  for (const [insect, crop] of expanded) {
    assert.ok(normaliseIpmDossier(api.exactProfile(insect, crop), insect, crop));
    const wrongCrop = crop === 'Zea mays' ? 'Glycine max' : 'Zea mays';
    assert.equal(normaliseIpmDossier(api.exactProfile(insect, crop), insect, wrongCrop), null);
  }

  const maize = normaliseIpmDossier(
    api.exactProfile('Spodoptera frugiperda', 'Zea mays'),
    'Spodoptera frugiperda',
    'Zea mays'
  );
  assert.equal(maize.thresholds[0].minimumYieldBagsPerHa, 100);
  assert.equal(maize.thresholds[0].labelKey, 'initialSymptomsHighYieldThreshold');
});

test('fetches are deduplicated and cached per exact pair and locale', async () => {
  clearIpmCache();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (!url.includes('cropScientific=')) return response({
      insectScientific: 'Tuta absoluta', crops: ['Solanum lycopersicum'],
    });
    return response(api.exactProfile('Tuta absoluta', 'Solanum lycopersicum'));
  };

  const options = { insectScientific: 'Tuta absoluta', language: 'pt-BR', fetchImpl };
  const [a, b] = await Promise.all([
    getSupportedIpmCrops(options), getSupportedIpmCrops(options),
  ]);
  assert.deepEqual(a, ['Solanum lycopersicum']);
  assert.deepEqual(b, a);
  assert.equal(calls, 1);

  const profileOptions = { ...options, cropScientific: 'Solanum lycopersicum' };
  assert.ok(await getIpmDossier(profileOptions));
  assert.ok(await getIpmDossier(profileOptions));
  assert.equal(calls, 2);
});

test('crop discovery caches only authoritative 200 responses, including an empty list', async () => {
  clearIpmCache();
  let transientCalls = 0;
  const transient = async () => {
    transientCalls += 1;
    return response({ error: 'temporary' }, 503);
  };
  const options = { insectScientific: 'Bemisia tabaci', language: 'pt', fetchImpl: transient };
  assert.equal(await getSupportedIpmCrops(options), null);
  assert.equal(await getSupportedIpmCrops(options), null);
  assert.equal(transientCalls, 2);

  clearIpmCache();
  let malformedCalls = 0;
  const malformed = async () => {
    malformedCalls += 1;
    return response({ insectScientific: 'Tuta absoluta', crops: ['Phaseolus vulgaris'] });
  };
  const malformedOptions = { ...options, fetchImpl: malformed };
  assert.equal(await getSupportedIpmCrops(malformedOptions), null);
  assert.equal(await getSupportedIpmCrops(malformedOptions), null);
  assert.equal(malformedCalls, 2);

  clearIpmCache();
  let authoritativeCalls = 0;
  const authoritative = async () => {
    authoritativeCalls += 1;
    return response({ insectScientific: 'Bemisia tabaci', crops: [] });
  };
  const emptyOptions = { ...options, fetchImpl: authoritative };
  assert.deepEqual(await getSupportedIpmCrops(emptyOptions), []);
  assert.deepEqual(await getSupportedIpmCrops(emptyOptions), []);
  assert.equal(authoritativeCalls, 1);
});

test('client timeout is hard even when a fetch implementation ignores abort', async () => {
  await assert.rejects(
    requestJson('https://naturelensapp.cloud/api/ipm-dossier', () => new Promise(() => {}), 10),
    /ipm_timeout/
  );
});

test('InsectDetailScreen integrates MIP through the verified identity boundary', () => {
  const screen = fs.readFileSync('screens/InsectDetailScreen.js', 'utf8');
  const card = fs.readFileSync('components/DynamicPestManagementCard.js', 'utf8');
  assert.match(screen, /<DynamicPestManagementCard/);
  assert.match(screen, /identityV1=\{plant\.identityV1\}/);
  assert.match(card, /enrichmentTaxon\(identityV1/);
  assert.doesNotMatch(card, /TouchableOpacity/);
});

test('all 17 locales cover every MIP crop, action and the conditional threshold', () => {
  const locales = ['ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pl', 'pt', 'sv', 'tr', 'zh', 'zh-hant'];
  const requiredCrops = ['arabicaCoffee', 'commonBean', 'maize', 'soybean', 'tomato', 'uplandCotton'];
  const thresholdPlaceholders = [
    'actionPercent', 'minimumYieldBagsPerHa', 'sampleAreaHa', 'samplePoints',
  ];
  for (const locale of locales) {
    const json = JSON.parse(fs.readFileSync(`public/locales/${locale}.json`, 'utf8'));
    for (const crop of requiredCrops) assert.ok(json.ipm.crops[crop], `${locale}: ${crop}`);
    for (const action of ACTIONS) assert.ok(json.ipm.actions[action], `${locale}: ${action}`);
    const threshold = json.ipm.thresholds.initialSymptomsHighYieldThreshold;
    assert.ok(threshold, `${locale}: threshold`);
    for (const placeholder of thresholdPlaceholders) {
      assert.match(threshold, new RegExp(`\\{\\{${placeholder}\\}\\}`), `${locale}: ${placeholder}`);
    }
    assert.equal(json.ipm.thresholds.initialScrapeThreshold, undefined);
  }
});
