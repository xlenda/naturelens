'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

const file = path.join(__dirname, 'components', 'agronomyProfileV2.js');
const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const profile = mod.exports;

function v1(overrides = {}) {
  return {
    schemaVersion: 1,
    purpose: 'grain',
    system: 'rainfed',
    location: { municipality: 'Uberlandia', state: 'MG' },
    planting: { date: '2026-08-01', stage: 'V6', stageConfirmed: true },
    soil: { description: 'Argiloso', hasReport: true },
    ...overrides,
  };
}

test('country validation accepts ISO alpha-2 and rejects guessed two-letter values', () => {
  assert.equal(profile.ISO_ALPHA2_CODES.length, 249);
  assert.equal(new Set(profile.ISO_ALPHA2_CODES).size, 249);
  assert.equal(profile.normalizeCountryCode(' br '), 'BR');
  assert.equal(profile.normalizeCountryCode('de'), 'DE');
  assert.equal(profile.normalizeCountryCode('JP'), 'JP');
  assert.equal(profile.normalizeCountryCode('ZZ'), null);
  assert.equal(profile.normalizeCountryCode('pt-BR'), null);
  assert.equal(profile.normalizeCountryCode('Portuguese'), null);
});

test('admin1 remains optional but can never cross its declared country', () => {
  assert.equal(profile.normalizeAdmin1Code('de-by', 'DE'), 'DE-BY');
  assert.equal(profile.normalizeAdmin1Code('BR-MG', 'DE'), null);
  assert.equal(profile.normalizeAdmin1Code('MG', 'BR'), null);
  assert.equal(profile.validAgronomyLocationV2({
    countryCode: 'DE', admin1Code: '', locality: 'Berlin',
  }), true);
  assert.equal(profile.validAgronomyLocationV2({
    countryCode: 'BR', admin1Code: 'BR-ZZ', locality: 'Cidade',
  }), false);
});

test('V1 migration is explicitly Brazilian and preserves agronomic fields', () => {
  const migrated = profile.migrateAgronomyProfileToV2(v1());
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.location, {
    countryCode: 'BR', admin1Code: 'BR-MG', locality: 'Uberlandia',
  });
  assert.equal(migrated.planting.stage, 'V6');
  assert.equal(migrated.soil.hasReport, true);

  const invalidState = profile.migrateAgronomyProfileToV2(v1({
    language: 'de',
    location: { municipality: 'Berlin', state: 'ZZ' },
  }));
  assert.deepEqual(invalidState.location, {
    countryCode: '', admin1Code: '', locality: 'Berlin',
  });
  assert.equal(profile.validAgronomyLocationV2(invalidState.location), false);
});

test('V2 country is read only from the profile and never from language', () => {
  const migrated = profile.migrateAgronomyProfileToV2({
    ...v1(),
    schemaVersion: 2,
    language: 'pt-BR',
    location: { countryCode: 'DE', admin1Code: 'DE-BY', locality: 'Freising' },
  });
  assert.deepEqual(migrated.location, {
    countryCode: 'DE', admin1Code: 'DE-BY', locality: 'Freising',
  });
  assert.equal(profile.agronomyLocationLabel(migrated.location), 'Freising · DE-BY · DE');
});
