'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

function loadExpoModule(relativePath, stubs = {}) {
  const file = path.join(__dirname, relativePath);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const fakeRequire = (name) => (
    Object.prototype.hasOwnProperty.call(stubs, name) ? stubs[name] : require(name)
  );
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

const registry = loadExpoModule('components/cropAgronomyRegistry.js');
const profileV2 = loadExpoModule('components/agronomyProfileV2.js');
const engine = require('./components/agronomyEngine');
const catalog = loadExpoModule('components/agronomyRuleCatalog.js', {
  './cropAgronomyRegistry': registry,
  './agronomyProfileV2': profileV2,
  './agronomyEngine': engine,
});

function entity(scientific, status = 'exact', overrides = {}) {
  return {
    category: 'crop',
    name: scientific,
    scientific,
    identityV1: {
      schemaVersion: 1,
      category: 'crop',
      status,
      provider: { name: 'crop.health', id: 'provider-1' },
      taxon: { canonicalName: scientific, rank: 'species', gbifKey: '5290052' },
    },
    ...overrides,
  };
}

function wizardProfile(overrides = {}) {
  const base = {
    schemaVersion: 2,
    purpose: 'grain',
    system: 'rainfed',
    location: { countryCode: 'BR', admin1Code: 'BR-MG', locality: 'Uberlandia' },
    planting: { date: '2026-08-01', stage: 'V6', stageConfirmed: true },
    soil: { description: 'Relatorio do laboratorio', hasReport: true },
  };
  return {
    ...base,
    ...overrides,
    location: overrides.location === undefined ? base.location : overrides.location,
    planting: overrides.planting === undefined ? base.planting : overrides.planting,
    soil: overrides.soil === undefined ? base.soil : overrides.soil,
  };
}

function legacyWizardProfile(overrides = {}) {
  return {
    ...wizardProfile(overrides),
    schemaVersion: 1,
    location: overrides.location || { municipality: 'Uberlandia', state: 'MG' },
  };
}

test('one guide rule exists for every registered primary binomial and exact alias', () => {
  const expected = registry.CROP_AGRONOMY_REGISTRY.flatMap((profile) => [
    profile.scientific,
    ...profile.exactAliases,
  ]);
  const actual = catalog.CROP_AGRONOMY_GUIDE_RULES.map((rule) => rule.taxon.canonicalName);

  assert.equal(catalog.selfCheck(), true);
  assert.equal(actual.length, expected.length);
  assert.deepEqual(
    actual.map(registry.canonicalCropBinomial).sort(),
    expected.map(registry.canonicalCropBinomial).sort()
  );
  assert.equal(new Set(actual.map(registry.canonicalCropBinomial)).size, expected.length);
});

test('the registry catalog contains guides only and invents no calculation', () => {
  for (const rule of catalog.CROP_AGRONOMY_GUIDE_RULES) {
    assert.equal(rule.kind, 'guide');
    assert.equal(rule.calculationId, null);
    assert.deepEqual(rule.requiredInputs, []);
  }
});

test('every rule source id is copied exactly from its own registry profile', () => {
  for (const rule of catalog.CROP_AGRONOMY_GUIDE_RULES) {
    const profile = registry.getCropAgronomyProfile(rule.taxon.canonicalName);
    const declared = profile.sourceRefs.map((reference) => reference.sourceId).sort();
    assert.deepEqual(rule.sourceIds.slice().sort(), declared, rule.id);
    assert.deepEqual(
      rule.output.sourceRefs.map((reference) => reference.sourceId).sort(),
      declared,
      `${rule.id}: output source refs`
    );
  }
});

test('an exact registered crop resolves to a technical guide', () => {
  const context = catalog.buildAgronomyContextForEntity(entity('Zea mays'), wizardProfile());
  const rules = catalog.getAgronomyRulesForEntity(entity('Zea mays'));
  const workspace = catalog.resolveAgronomyWorkspace(entity('Zea mays'), wizardProfile());

  assert.equal(context.identity.exact, true);
  assert.equal(context.identity.canonicalName, 'Zea mays');
  assert.equal(context.region.code, 'BR-MG');
  assert.equal(context.stage.code, 'V6');
  assert.deepEqual(context.methods, {});
  assert.equal(rules.length, 1);
  assert.equal(workspace.state, engine.AGRONOMY_STATUS.TECHNICAL_GUIDE);
  assert.equal(workspace.calculationRules.length, 0);
  assert.equal(workspace.profileKey, 'maize');
});

test('candidate identity never inherits an exact rule from its scientific label', () => {
  const candidate = entity('Zea mays', 'candidate');
  const profile = wizardProfile({ identityStatus: 'exact', scientific: 'Zea mays' });
  const context = catalog.buildAgronomyContextForEntity(candidate, profile);
  const workspace = catalog.resolveAgronomyWorkspace(candidate, profile);

  assert.equal(context.identity.exact, false);
  assert.deepEqual(catalog.getAgronomyRulesForEntity(candidate), []);
  assert.equal(workspace.state, engine.AGRONOMY_STATUS.REGIONAL_MATRIX_UNAVAILABLE);
  assert.equal(workspace.selectedRule, null);
});

test('legacy identity remains non-exact even when its text matches maize', () => {
  const legacy = { category: 'crop', scientific: 'Zea mays', name: 'Milho' };
  const context = catalog.buildAgronomyContextForEntity(legacy, wizardProfile());
  const workspace = catalog.resolveAgronomyWorkspace(legacy, wizardProfile());

  assert.equal(context.identity.canonicalName, 'Zea mays');
  assert.equal(context.identity.exact, false);
  assert.equal(workspace.state, engine.AGRONOMY_STATUS.REGIONAL_MATRIX_UNAVAILABLE);
});

test('an exact but unregistered crop has no borrowed guide', () => {
  const unknown = entity('Setaria italica');
  const context = catalog.buildAgronomyContextForEntity(unknown, wizardProfile());
  const workspace = catalog.resolveAgronomyWorkspace(unknown, wizardProfile());

  assert.equal(context.identity.exact, true);
  assert.deepEqual(catalog.getAgronomyRulesForEntity(unknown), []);
  assert.equal(workspace.state, engine.AGRONOMY_STATUS.REGIONAL_MATRIX_UNAVAILABLE);
});

test('the registered hybrid and its exact alias resolve independently', () => {
  for (const scientific of ['Citrus x sinensis', 'Citrus sinensis']) {
    const rules = catalog.getAgronomyRulesForEntity(entity(scientific));
    const workspace = catalog.resolveAgronomyWorkspace(entity(scientific), wizardProfile());
    assert.equal(rules.length, 1, scientific);
    assert.equal(rules[0].taxon.canonicalName, scientific);
    assert.equal(workspace.state, engine.AGRONOMY_STATUS.TECHNICAL_GUIDE, scientific);
    assert.equal(workspace.profileKey, 'sweetOrange');
  }
});

test('V1 Brazilian state and V2 worldwide ISO regions are emitted without inference', () => {
  const crop = entity('Zea mays');
  assert.equal(
    catalog.buildAgronomyContextForEntity(crop, wizardProfile()).region.code,
    'BR-MG'
  );
  assert.equal(
    catalog.buildAgronomyContextForEntity(crop, legacyWizardProfile()).region.code,
    'BR-MG'
  );
  assert.deepEqual(
    catalog.buildAgronomyContextForEntity(crop, wizardProfile({
      location: { countryCode: 'DE', admin1Code: 'DE-BY', locality: 'Freising' },
    })).region,
    { code: 'DE-BY', scheme: 'ISO-3166-2' }
  );
  assert.deepEqual(
    catalog.buildAgronomyContextForEntity(crop, wizardProfile({
      location: { countryCode: 'DE', admin1Code: null, locality: 'Berlin' },
    })).region,
    { code: 'DE', scheme: 'ISO-3166-1' }
  );
  assert.equal(
    catalog.buildAgronomyContextForEntity(crop, wizardProfile({
      location: { countryCode: 'DE', admin1Code: 'BR-MG', locality: 'X' },
    })).region,
    null
  );
  assert.equal(
    catalog.buildAgronomyContextForEntity(crop, wizardProfile({
      location: { countryCode: 'BR', admin1Code: 'BR-ZZ', locality: 'X' },
    })).region,
    null
  );
});

test('stage exists only after the user confirms it', () => {
  const crop = entity('Zea mays');
  const unconfirmed = wizardProfile({
    planting: { date: '2026-08-01', stage: 'V6', stageConfirmed: false },
  });
  const empty = wizardProfile({
    planting: { date: '2026-08-01', stage: '', stageConfirmed: true },
  });

  assert.equal(catalog.buildAgronomyContextForEntity(crop, unconfirmed).stage, null);
  assert.equal(catalog.buildAgronomyContextForEntity(crop, empty).stage, null);
  assert.equal(catalog.buildAgronomyContextForEntity(crop, wizardProfile()).stage.code, 'V6');
});

test('free soil prose and forged method fields never become analytical methods', () => {
  const profile = wizardProfile({
    methods: { phosphorus: 'mehlich-1' },
    soil: {
      description: 'O texto diz Mehlich-1 e pH em agua',
      hasReport: true,
      methods: { soilPh: 'water' },
    },
  });
  const context = catalog.buildAgronomyContextForEntity(entity('Zea mays'), profile);

  assert.deepEqual(context.methods, {});
  assert.equal(context.inputs.soil.description, 'O texto diz Mehlich-1 e pH em agua');
  assert.equal(context.inputs.soil.hasReport, true);
});

test('future or malformed wizard profiles cannot leak region, stage or methods', () => {
  const profile = wizardProfile({
    schemaVersion: 3,
    methods: { phosphorus: 'mehlich-1' },
  });
  const context = catalog.buildAgronomyContextForEntity(entity('Zea mays'), profile);

  assert.equal(context.region, null);
  assert.equal(context.stage, null);
  assert.deepEqual(context.methods, {});
  assert.deepEqual(context.inputs, {});
});
