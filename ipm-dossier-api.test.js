const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('./api/ipm-dossier');

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function allKeys(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    out.push(key);
    allKeys(child, out);
  }
  return out;
}

test('MIP only resolves exact scientific insect-crop intersections', () => {
  assert.equal(api.scientific(' Spodoptera frugiperda '), 'Spodoptera frugiperda');
  assert.equal(api.scientific('spodoptera frugiperda'), null);
  assert.equal(api.scientific('Spodoptera frugiperda Smith'), null);
  assert.equal(api.scientific(['Spodoptera frugiperda']), null);

  assert.deepEqual(api.supportedCrops('Spodoptera frugiperda'), ['Zea mays']);
  assert.deepEqual(api.supportedCrops('Dalbulus maidis'), ['Zea mays']);
  assert.deepEqual(api.supportedCrops('Bemisia tabaci'), ['Phaseolus vulgaris']);
  assert.deepEqual(api.supportedCrops('Anthonomus grandis'), ['Gossypium hirsutum']);
  assert.deepEqual(api.supportedCrops('Hypothenemus hampei'), ['Coffea arabica']);
  assert.deepEqual(api.supportedCrops('Chrysodeixis includens'), ['Glycine max']);
  assert.deepEqual(api.supportedCrops('Anticarsia gemmatalis'), ['Glycine max']);
  assert.equal(api.exactProfile('Spodoptera frugiperda', 'Glycine max'), null);
  assert.equal(api.exactProfile('Tuta absoluta', 'Zea mays'), null);
  assert.equal(api.exactProfile('Bemisia tabaci', 'Glycine max'), null);
  assert.equal(api.exactProfile('Hypothenemus hampei', 'Coffea canephora'), null);
  assert.equal(api.exactProfile('Euschistus heros', 'Glycine max').pairId, 'brown-stinkbug-soy-v1');
  assert.equal(api.exactProfile('Anticarsia gemmatalis', 'Glycine max').pairId,
    'velvetbean-caterpillar-soy-v1');
  assert.equal(Object.keys(api.PAIRS).length, 9);
});

test('numeric threshold includes its high-yield applicability and stays on the exact maize pair', () => {
  const maize = api.exactProfile('Spodoptera frugiperda', 'Zea mays');
  assert.deepEqual(maize.thresholds, [{
    id: 'initial-symptoms-high-yield',
    labelKey: 'initialSymptomsHighYieldThreshold',
    samplePoints: 5,
    sampleAreaHa: 1,
    actionPercent: 10,
    minimumYieldBagsPerHa: 100,
  }]);
  assert.deepEqual(api.exactProfile('Tuta absoluta', 'Solanum lycopersicum').thresholds, []);
  assert.deepEqual(api.exactProfile('Euschistus heros', 'Glycine max').thresholds, []);
  for (const [pair, profile] of Object.entries(api.PAIRS)) {
    if (pair !== 'Spodoptera frugiperda|Zea mays') assert.deepEqual(profile.thresholds, []);
  }
});

test('profiles never carry pesticide products, active ingredients or doses', () => {
  const forbidden = /product|produto|dose|dosage|ingredient|ingrediente|rate|dosagem/i;
  for (const profile of Object.values(api.PAIRS)) {
    assert.equal(allKeys(profile).some((key) => forbidden.test(key)), false);
  }
  const maize = api.exactProfile('Spodoptera frugiperda', 'Zea mays');
  assert.deepEqual(maize.chemical, { type: 'label-referral', registryId: 'agrofit' });
});

test('handler lists supported crops then serves the exact pair with long edge cache', async () => {
  const list = responseRecorder();
  await api({ method: 'GET', query: {
    insectScientific: 'Spodoptera frugiperda', language: 'pt-BR',
  } }, list);
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.body, {
    insectScientific: 'Spodoptera frugiperda', crops: ['Zea mays'],
  });
  assert.match(list.headers['cache-control'], /s-maxage=86400/);

  const profile = responseRecorder();
  await api({ method: 'GET', query: {
    insectScientific: 'Spodoptera frugiperda',
    cropScientific: 'Zea mays',
    language: 'pt',
  } }, profile);
  assert.equal(profile.statusCode, 200);
  assert.equal(profile.body.insectScientific, 'Spodoptera frugiperda');
  assert.equal(profile.body.cropScientific, 'Zea mays');
  assert.equal(profile.headers['x-content-type-options'], 'nosniff');
});

test('unknown pair and invalid or repeated input fail closed', async () => {
  const mismatch = responseRecorder();
  await api({ method: 'GET', query: {
    insectScientific: 'Spodoptera frugiperda', cropScientific: 'Glycine max', language: 'pt',
  } }, mismatch);
  assert.equal(mismatch.statusCode, 404);
  assert.deepEqual(mismatch.body, { error: 'pair_not_verified' });

  const invalid = responseRecorder();
  await api({ method: 'GET', query: {
    insectScientific: ['Spodoptera frugiperda'], language: 'pt',
  } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.headers['cache-control'], /no-store/);

  const method = responseRecorder();
  await api({ method: 'POST', query: {} }, method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET');
});

test('all sources use official HTTPS hosts and declare their reuse boundary', () => {
  for (const source of Object.values(api.SOURCES)) {
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(url.hostname.endsWith('.embrapa.br') || url.hostname === 'www.embrapa.br'
      || url.hostname === 'www.gov.br');
    assert.ok(['citation-only', 'CC-BY-ND-3.0'].includes(source.license));
  }
});

test('every expanded profile keeps an exact Embrapa publication and Agrofit attached', () => {
  const expanded = [
    ['Dalbulus maidis', 'Zea mays', 'embrapa-maize-leafhopper'],
    ['Bemisia tabaci', 'Phaseolus vulgaris', 'embrapa-bean-whitefly'],
    ['Anthonomus grandis', 'Gossypium hirsutum', 'embrapa-cotton-boll-weevil'],
    ['Hypothenemus hampei', 'Coffea arabica', 'embrapa-coffee-berry-borer'],
    ['Chrysodeixis includens', 'Glycine max', 'embrapa-soy-looper'],
    ['Anticarsia gemmatalis', 'Glycine max', 'embrapa-soy-caterpillar'],
  ];
  for (const [insect, crop, publication] of expanded) {
    const profile = api.exactProfile(insect, crop);
    assert.deepEqual(profile.sources.map((source) => source.id), [publication, 'agrofit']);
    assert.deepEqual(profile.chemical, { type: 'label-referral', registryId: 'agrofit' });
    assert.deepEqual(profile.thresholds, []);
  }
});
