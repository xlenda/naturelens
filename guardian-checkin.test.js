'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

function load(relative, stubs = {}) {
  const { code } = babel.transformFileSync(path.join(__dirname, relative), { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(
    mod,
    mod.exports,
    (name) => (name in stubs ? stubs[name] : require(name))
  );
  return mod.exports;
}

test('pet safety only resolves curated exact taxa or documented genera', () => {
  const catalog = load('components/petSafetyCatalog.js');
  const sago = catalog.getPetSafetyRecord('Cycas revoluta');
  assert.equal(sago.dog, 'toxic');
  assert.equal(sago.cat, 'toxic');
  assert.equal(sago.severity, 'emergency');
  assert.match(sago.sourceUrl, /^https:\/\/www\.aspca\.org\//);

  const lily = catalog.getPetSafetyRecord('Lilium candidum');
  assert.equal(lily.scope, 'genus');
  assert.equal(lily.dog, 'safe');
  assert.equal(lily.cat, 'toxic');
  assert.equal(catalog.getPetSafetyRecord('Completely invented'), null);
});

test('identity correction preserves model answer and never claims exact validation', () => {
  const review = load('components/identityReview.js');
  const entity = {
    name: 'Top answer', scientific: 'Exemplum primum', confidence: 81,
    sourceProvider: 'plant.id',
  };
  const result = review.createIdentityReview(entity, 'alternative', {
    name: 'Second answer', scientific: 'Exemplum secundum', confidence: 14,
  });
  assert.equal(result.original.scientific, 'Exemplum primum');
  assert.equal(result.finalChoice.scientific, 'Exemplum secundum');
  assert.equal(result.requiresRecapture, true);
  assert.equal(result.decision, 'alternative');
  assert.equal(Object.hasOwn(result, 'verified'), false);
});

test('city check-in cannot persist coordinates and public copy drops private note', () => {
  const checkIn = load('components/natureCheckIn.js');
  const value = checkIn.createNatureCheckIn({
    city: ' Campinas ', country: 'Brasil', countryCode: 'br', habitat: 'garden',
    note: 'No quintal de casa', latitude: -22.9, longitude: -47.1,
  });
  assert.equal(value.city, 'Campinas');
  assert.equal(value.countryCode, 'BR');
  assert.equal(value.precision, 'city');
  assert.equal(Object.hasOwn(value, 'latitude'), false);
  assert.equal(Object.hasOwn(value, 'longitude'), false);
  const shared = checkIn.publicCheckIn(value);
  assert.equal(Object.hasOwn(shared, 'note'), false);
  assert.equal(checkIn.createNatureCheckIn({ city: 'X', country: 'Y', habitat: 'moon' }), null);
});

test('all result screens receive review, pet safety and check-in through the shared evidence layer', () => {
  const source = fs.readFileSync(path.join(__dirname, 'components', 'IdentificationExtras.js'), 'utf8');
  assert.match(source, /<PetGuardianCard entity=\{interactiveEntity\}/);
  assert.match(source, /<IdentityReviewCard/);
  assert.match(source, /<NatureCheckInCard entity=\{interactiveEntity\}/);
  for (const screen of ['Plant', 'Tree', 'Crop', 'Insect', 'Mushroom', 'Fish', 'Bird', 'Sound']) {
    const screenSource = fs.readFileSync(path.join(__dirname, 'screens', `${screen}DetailScreen.js`), 'utf8');
    assert.match(screenSource, /<IdentificationExtras/, screen);
  }
});

test('collection sync carries review and city check-in but no coordinate field', () => {
  const source = fs.readFileSync(path.join(__dirname, 'api', 'collection.js'), 'utf8');
  assert.match(source, /'identityReview'/);
  assert.match(source, /'checkIn'/);
  assert.match(source, /function sanitiseIdentityReview/);
  assert.match(source, /function sanitiseCheckIn/);
  assert.match(source, /precision: 'city'/);
  assert.match(source, /cannot sync latitude, longitude/);
});

test('all detail screens hand the live saved id to the shared layer', () => {
  for (const screen of ['Plant', 'Tree', 'Crop', 'Insect', 'Mushroom', 'Fish', 'Bird', 'Sound']) {
    const source = fs.readFileSync(path.join(__dirname, 'screens', `${screen}DetailScreen.js`), 'utf8');
    assert.match(source, /savedId=\{savedEntryId \|\| plant\.savedId \|\| null\}/, screen);
  }
});
