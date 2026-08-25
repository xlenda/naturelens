const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const babel = require('@babel/core');

const ROOT = __dirname;
const SCREEN = path.join(ROOT, 'screens', 'ObservationWorkspaceScreen.js');
const source = fs.readFileSync(SCREEN, 'utf8');

test('observation workspace is category-aware and keeps crop in agronomy', () => {
  assert.match(source, /getObservationWorkspaceConfig\(category\)/);
  assert.match(source, /observationSubjectKey\(entity, savedId\)/);
  assert.match(source, /const TABS = Object\.freeze\(\['essential', 'learn', 'field'\]\)/);
  assert.doesNotMatch(source, /AgronomyWorkspace|fertilizer|watering|pesticide|recommendedDose/);
});

test('profile and events celebrate only after local persistence', () => {
  assert.match(source, /await saveObservationProfile/);
  assert.match(source, /await appendObservationEvent/);
  assert.ok(source.indexOf('await saveObservationProfile') < source.indexOf("setProfileMessage('saved')"));
  assert.ok(source.indexOf('await appendObservationEvent') < source.indexOf("setEventMessage('saved')"));
  assert.doesNotMatch(source, /updateObservationEvent|deleteObservationEvent|removeObservationEvent/);
});

test('stale profile contexts fail closed before enabling new events', () => {
  assert.match(source, /const profileReady = Boolean\(/);
  assert.match(source, /contextOptions\.some\(\(option\) => option\.key === profile\?\.fields\?\.context\)/);
  assert.match(source, /if \(!profileReady \|\| !eventType \|\| eventBusy\) return/);
  assert.match(source, /editingProfile \|\| !profileReady/);
});

test('numeric evidence respects category capabilities and accepts signed readings', () => {
  assert.match(source, /\/\^-\?\\d\+/);
  assert.match(source, /config\.allowsCount && !countState\.valid/);
  assert.match(source, /config\.allowsMeasure && !measureState\.valid/);
  assert.match(source, /unit: storedMeasure === null \? null : eventUnit/);
});

test('learning is visual, tappable and honest instead of a text wall', () => {
  assert.match(source, /function VisualDiagram/);
  for (const diagram of ['layers', 'grid', 'waveform', 'count', 'compare', 'anatomy', 'timeline']) {
    assert.match(source, new RegExp(`diagram === '${diagram}'`));
  }
  assert.match(source, /visualTopics\.map/);
  assert.match(source, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(source, /observationWorkspace\.generalDiagram/);
});

test('field progress is based on real recorded event types', () => {
  assert.match(source, /new Set\(\(events \|\| \[\]\)\.map/);
  assert.match(source, /recordedTypes\.has\(typeOption\.key\)/);
  assert.match(source, /progressLabel/);
  assert.doesNotMatch(source, /tokensEarned|streak|random|Math\.random/);
});

test('mushroom workspace keeps an explicit non-consumption warning', () => {
  assert.match(source, /category === 'mushroom'/);
  assert.match(source, /observationWorkspace\.mushroomSafety/);
});

test('workspace compiles for Expo', () => {
  assert.doesNotThrow(() => babel.transformFileSync(SCREEN, { presets: ['babel-preset-expo'] }));
});
