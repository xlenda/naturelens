// Contrato do registro agronomico: cobertura explicita por especie, sem
// transformar parentesco botanico em permissao para mostrar uma tabela.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

function loadRegistry() {
  const file = path.join(__dirname, 'components', 'cropAgronomyRegistry.js');
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}

const registry = loadRegistry();

test('registry covers every crop currently visible in Discover', () => {
  const discover = {
    'Zea mays': 'maize',
    'Manihot esculenta': 'cassava',
    'Coffea arabica': 'arabicaCoffee',
    'Glycine max': 'soybean',
    'Saccharum officinarum': 'sugarcane',
    'Triticum aestivum': 'breadWheat',
    'Oryza sativa': 'asianRice',
    'Solanum tuberosum': 'potato',
    'Musa acuminata': 'banana',
    'Citrus x sinensis': 'sweetOrange',
  };

  for (const [scientific, catalogId] of Object.entries(discover)) {
    const profile = registry.getCropAgronomyProfile(scientific);
    assert.ok(profile, scientific);
    assert.equal(profile.catalogId, catalogId);
    assert.equal(profile.exposure.discoverCatalog, true);
    assert.ok(profile.modules.current.includes(registry.CROP_AGRONOMY_MODULES.curatedBasic));
  }
  assert.equal(
    registry.CROP_AGRONOMY_REGISTRY.filter((entry) => entry.exposure.discoverCatalog).length,
    Object.keys(discover).length
  );
});

test('registry covers the complete current exact crop routing allowlist', () => {
  const routed = [
    'Zea mays',
    'Glycine max',
    'Triticum aestivum',
    'Oryza sativa',
    'Helianthus annuus',
    'Brassica napus',
    'Brassica juncea',
    'Brassica oleracea',
    'Chenopodium quinoa',
    'Amaranthus caudatus',
    'Amaranthus cruentus',
    'Amaranthus hypochondriacus',
    'Manihot esculenta',
    'Solanum tuberosum',
    'Lactuca sativa',
    'Allium cepa',
    'Ananas comosus',
    'Musa acuminata',
    'Citrus sinensis',
  ];

  for (const scientific of routed) {
    assert.equal(registry.getCropAgronomyProfile(scientific)?.exposure.agronomyRouting, 'exact', scientific);
  }
  assert.equal(
    registry.CROP_AGRONOMY_REGISTRY.filter((entry) => entry.exposure.agronomyRouting === 'exact').length,
    routed.length
  );
});

test('priority crops are declared without pretending their dossiers already exist', () => {
  const priorities = [
    'Phaseolus vulgaris',
    'Sorghum bicolor',
    'Solanum lycopersicum',
    'Arachis hypogaea',
    'Hordeum vulgare',
    'Avena sativa',
    'Gossypium hirsutum',
  ];

  for (const scientific of priorities) {
    const profile = registry.getCropAgronomyProfile(scientific);
    assert.ok(profile, scientific);
    assert.equal(profile.exposure.expansionPriority, true);
    assert.equal(profile.modules.current.length, 0);
    assert.ok(profile.modules.planned.includes(registry.CROP_AGRONOMY_MODULES.curatedBasic));
  }
});

test('lookup is exact by binomial and never falls through family, genus or neighbour species', () => {
  const misses = [
    null,
    '',
    'Poaceae',
    'Zea',
    'milho',
    'Zea diploperennis',
    'Glycine soja',
    'Saccharum spontaneum',
    'Gossypium barbadense',
    'Solanum melongena',
    'Brassica rapa',
    'Unknown crop',
  ];
  for (const scientific of misses) {
    assert.equal(registry.getCropAgronomyProfile(scientific), null, String(scientific));
  }

  assert.equal(registry.getCropAgronomyProfile('Zea mays L.')?.key, 'maize');
  assert.equal(registry.getCropAgronomyProfile('Citrus × sinensis')?.key, 'sweetOrange');
  assert.equal(registry.getCropAgronomyProfile('Citrus sinensis')?.key, 'sweetOrange');
});

test('current structured modules stay attached only to their audited crop', () => {
  const modulesFor = (scientific) => registry.getCropAgronomyProfile(scientific).modules.current;
  const M = registry.CROP_AGRONOMY_MODULES;

  assert.ok(modulesFor('Zea mays').includes(M.fertilizerExtraction));
  assert.ok(modulesFor('Zea mays').includes(M.pestMonitoring));
  assert.ok(modulesFor('Glycine max').includes(M.pestMonitoring));
  assert.ok(modulesFor('Allium cepa').includes(M.nutrientExcessGuide));

  for (const entry of registry.CROP_AGRONOMY_REGISTRY) {
    if (entry.scientific !== 'Zea mays') {
      assert.equal(entry.modules.current.includes(M.fertilizerExtraction), false, entry.scientific);
    }
    if (entry.scientific !== 'Zea mays' && entry.scientific !== 'Glycine max') {
      assert.equal(entry.modules.current.includes(M.pestMonitoring), false, entry.scientific);
    }
    if (entry.scientific !== 'Allium cepa') {
      assert.equal(entry.modules.current.includes(M.nutrientExcessGuide), false, entry.scientific);
    }
  }
});

test('planning references do not promote modules or unblock routing', () => {
  const M = registry.CROP_AGRONOMY_MODULES;
  const expectedCurrent = {
    cassava: [M.curatedBasic],
    arabicaCoffee: [M.curatedBasic],
    sugarcane: [M.curatedBasic],
    breadWheat: [M.curatedBasic],
    potato: [M.curatedBasic],
    banana: [M.curatedBasic],
    sweetOrange: [M.curatedBasic],
    commonBean: [],
    cotton: [],
    tomato: [],
    lettuce: [],
  };

  for (const [key, modules] of Object.entries(expectedCurrent)) {
    const profile = registry.CROP_AGRONOMY_REGISTRY.find((entry) => entry.key === key);
    assert.ok(profile, key);
    assert.ok(profile.sourceRefs.length > 0, key);
    assert.deepEqual(profile.modules.current, modules, key);
  }

  assert.equal(
    registry.getCropAgronomyProfile('Coffea arabica').exposure.agronomyRouting,
    'blocked'
  );
  assert.equal(
    registry.getCropAgronomyProfile('Saccharum officinarum').exposure.agronomyRouting,
    'blocked'
  );
  assert.equal(
    registry.getCropAgronomyProfile('Gossypium hirsutum').exposure.agronomyRouting,
    'blocked'
  );
});

test('every declared source is official, referenced and scoped to a module', () => {
  const referenced = new Set();
  for (const entry of registry.CROP_AGRONOMY_REGISTRY) {
    assert.ok(entry.key);
    assert.ok(entry.purposes.length > 0, entry.key);
    assert.ok(entry.requiredContexts.length > 0, entry.key);
    assert.ok(entry.modules.planned.length > 0, entry.key);
    for (const ref of entry.sourceRefs) {
      const source = registry.getCropAgronomySource(ref.sourceId);
      assert.ok(source, `${entry.key}: ${ref.sourceId}`);
      assert.ok(ref.supports.length > 0, `${entry.key}: ${ref.sourceId}`);
      assert.match(source.url, /^https:\/\/(?:[a-z0-9-]+\.)*(?:embrapa\.br|gov\.br|fao\.org)\//i);
      referenced.add(ref.sourceId);
    }
  }
  assert.deepEqual(
    [...referenced].sort(),
    Object.keys(registry.CROP_AGRONOMY_SOURCES).sort(),
    'orphan official sources should not accumulate in the registry'
  );
  assert.equal(registry.selfCheck(), true);
});
