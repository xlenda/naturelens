'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const { uiLocaleFiles } = require('./test-locales');
const {
  OBSERVATION_WORKSPACE_CATEGORIES,
  OBSERVATION_EVENT_TYPES_BY_CATEGORY,
  OBSERVATION_UNITS_BY_CATEGORY,
  getObservationWorkspaceConfig,
} = require('./components/observationWorkspaceConfig');

const ROOT = __dirname;
const LOCALES = path.join(ROOT, 'public', 'locales');
const EXPECTED = ['plant', 'tree', 'insect', 'mushroom', 'fish', 'bird', 'sound'];
const COLORS = new Set(['accent', 'info', 'warning', 'purple', 'error']);
const DIAGRAMS = new Set(['layers', 'grid', 'timeline', 'waveform', 'compare', 'anatomy', 'flow', 'count']);

function loadStorageContract() {
  const file = path.join(ROOT, 'components', 'observationStorage.js');
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const asyncStorage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
  const fakeRequire = (name) => name === '@react-native-async-storage/async-storage'
    ? asyncStorage
    : require(name);
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

const STORAGE_CONTRACT = loadStorageContract();
const STORAGE_EVENT_TYPES = STORAGE_CONTRACT.OBSERVATION_EVENT_TYPES_BY_CATEGORY;
const STORAGE_UNITS = STORAGE_CONTRACT.OBSERVATION_UNITS_BY_CATEGORY;

function flatKeys(value, prefix = '') {
  return Object.entries(value || {}).flatMap(([key, child]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child)
      ? flatKeys(child, full)
      : [full];
  });
}

function readLocale(file) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES, file), 'utf8'));
}

function getIn(value, dotted) {
  return dotted.split('.').reduce((current, key) => current?.[key], value);
}

test('the advanced observation registry covers only the seven supported categories', () => {
  assert.deepEqual(OBSERVATION_WORKSPACE_CATEGORIES, EXPECTED);
  assert.ok(Object.isFrozen(OBSERVATION_WORKSPACE_CATEGORIES));
  for (const unsupported of [null, undefined, '', 'crop', 'animal', 'fungus', 'unknown']) {
    assert.equal(getObservationWorkspaceConfig(unsupported), null);
  }
});

test('every config is immutable, category-specific and safe for a data-driven screen', () => {
  for (const category of EXPECTED) {
    const config = getObservationWorkspaceConfig(category);
    assert.equal(config.key, category);
    assert.ok(Object.isFrozen(config));
    assert.equal(config.levels.length, 3);
    assert.deepEqual(config.levels.map(({ key }) => key), ['essential', 'learn', 'field']);
    assert.ok(config.contexts.length >= 4);
    assert.ok(config.eventTypes.length >= 4);
    assert.ok(config.visualTopics.length >= 3 && config.visualTopics.length <= 5);
    assert.equal(typeof config.allowsCount, 'boolean');
    assert.equal(typeof config.allowsMeasure, 'boolean');
    assert.ok(COLORS.has(config.accent));

    assert.deepEqual(config.eventTypes.map(({ key }) => key), STORAGE_EVENT_TYPES[category]);
    assert.deepEqual(config.units.map(({ value }) => value), STORAGE_UNITS[category]);
    assert.equal(new Set(config.eventTypes.map(({ key }) => key)).size, config.eventTypes.length);
    for (const item of config.eventTypes) {
      assert.match(item.labelKey, new RegExp(`^observationWorkspace\\.eventTypes\\.${category}\\.`));
    }
    for (const item of config.visualTopics) {
      assert.ok(COLORS.has(item.colorToken), `${category}.${item.key}: unsafe color token`);
      assert.ok(DIAGRAMS.has(item.diagram), `${category}.${item.key}: unknown diagram`);
    }
    if (!config.allowsMeasure) assert.deepEqual(config.units, []);
    for (const item of config.units) {
      assert.ok(item.key && item.value && item.labelKey);
      assert.match(item.labelKey, /^observationWorkspace\.units\./);
    }
  }
});

test('exported storage vocabularies stay frozen and match every rendered config', () => {
  assert.deepEqual(STORAGE_CONTRACT.OBSERVATION_CATEGORIES, EXPECTED);
  assert.deepEqual(OBSERVATION_EVENT_TYPES_BY_CATEGORY, STORAGE_EVENT_TYPES);
  assert.deepEqual(OBSERVATION_UNITS_BY_CATEGORY, STORAGE_UNITS);
  assert.ok(Object.isFrozen(OBSERVATION_EVENT_TYPES_BY_CATEGORY));
  assert.ok(Object.isFrozen(OBSERVATION_UNITS_BY_CATEGORY));
  for (const category of EXPECTED) {
    assert.ok(Object.isFrozen(OBSERVATION_EVENT_TYPES_BY_CATEGORY[category]));
    assert.ok(Object.isFrozen(OBSERVATION_UNITS_BY_CATEGORY[category]));
  }
});

test('every config key resolves in every locale without English fallback', () => {
  const localeFiles = uiLocaleFiles();
  assert.equal(localeFiles.length, 17);
  const en = readLocale('en.json').observationWorkspace;
  const expectedKeys = flatKeys(en).sort();

  for (const file of localeFiles) {
    const locale = readLocale(file);
    const namespace = locale.observationWorkspace;
    assert.ok(namespace && typeof namespace === 'object', `${file}: namespace missing`);
    assert.deepEqual(flatKeys(namespace).sort(), expectedKeys, `${file}: namespace key drift`);

    for (const key of expectedKeys) {
      const value = getIn(namespace, key);
      assert.ok(typeof value === 'string' && value.trim(), `${file}: empty ${key}`);
    }
    assert.deepEqual(
      [...getIn(namespace, 'progressLabel').matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort(),
      ['done', 'total'],
      `${file}: progress placeholders changed`
    );

    for (const category of EXPECTED) {
      const config = getObservationWorkspaceConfig(category);
      for (const item of [...config.contexts, ...config.eventTypes]) {
        assert.ok(getIn(locale, item.labelKey), `${file}: missing ${item.labelKey}`);
      }
      for (const item of config.units) assert.ok(getIn(locale, item.labelKey), `${file}: missing ${item.labelKey}`);
      for (const item of config.visualTopics) {
        assert.ok(getIn(locale, item.titleKey), `${file}: missing ${item.titleKey}`);
        assert.ok(getIn(locale, item.bodyKey), `${file}: missing ${item.bodyKey}`);
      }
    }
  }
});

test('fauna, fungi and sound never receive plant-care event types or units', () => {
  const forbidden = /watering|fertili[sz]|irrigat|adub|rega/i;
  for (const category of ['insect', 'mushroom', 'fish', 'bird', 'sound']) {
    const config = getObservationWorkspaceConfig(category);
    const contract = JSON.stringify(config);
    assert.doesNotMatch(contract, forbidden, `${category}: plant care leaked into observation contract`);
  }
});

test('safety boundaries remain explicit and observational', () => {
  const en = readLocale('en.json').observationWorkspace;
  assert.match(en.mushroomSafety, /never consume/i);
  assert.doesNotMatch(JSON.stringify(en.eventTypes.insect), /pest|harmful/i);
  assert.match(en.visuals.insect.behaviour.body, /observed/i);
  assert.match(en.visuals.fish.behaviour.body, /distance|contact/i);
  assert.doesNotMatch(JSON.stringify(en), /\b\d+(?:[.,]\d+)?\b/, 'workspace copy must not invent thresholds');
});
