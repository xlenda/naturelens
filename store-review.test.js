const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

function loadStoreReview(stubs) {
  const { code } = babel.transformFileSync(path.join(__dirname, 'components/storeReview.js'), {
    presets: ['babel-preset-expo'],
  });
  const mod = { exports: {} };
  const fakeRequire = (name) => (name in stubs ? stubs[name] : require(name));
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

test('avaliacao nativa so e solicitada depois de dois sinais positivos', async () => {
  const memory = new Map();
  let requests = 0;
  const review = loadStoreReview({
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => memory.set(key, value),
    },
    'react-native': { Platform: { OS: 'android' } },
    'expo-store-review': {
      isAvailableAsync: async () => true,
      requestReview: async () => { requests += 1; },
    },
  });

  assert.equal(await review.recordPositiveReviewSignal(), false);
  assert.equal(requests, 0);
  assert.equal(await review.recordPositiveReviewSignal(), true);
  assert.equal(requests, 1);
  assert.equal(await review.recordPositiveReviewSignal(), false);
  assert.equal(requests, 1);

  const stored = JSON.parse([...memory.values()][0]);
  assert.equal(stored.positiveSignals, 2);
  assert.ok(stored.requestedAt);
});

test('web nunca abre avaliacao nem quebra o feedback', async () => {
  const memory = new Map();
  let requests = 0;
  const review = loadStoreReview({
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => memory.set(key, value),
    },
    'react-native': { Platform: { OS: 'web' } },
    'expo-store-review': {
      isAvailableAsync: async () => true,
      requestReview: async () => { requests += 1; },
    },
  });

  await review.recordPositiveReviewSignal();
  assert.equal(await review.recordPositiveReviewSignal(), false);
  assert.equal(requests, 0);
});
