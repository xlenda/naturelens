const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const babel = require('@babel/core');

const ROOT = __dirname;
const FILE = path.join(ROOT, 'components', 'deviceId.js');
const source = fs.readFileSync(FILE, 'utf8');

function loadModule({ stored = null, ids = [] } = {}) {
  let value = stored;
  let randomCalls = 0;
  let writes = 0;
  const asyncStorage = {
    getItem: async () => value,
    setItem: async (_key, next) => { value = next; writes += 1; },
    removeItem: async () => { value = null; },
  };
  const crypto = {
    randomUUID: () => {
      const next = ids[randomCalls];
      randomCalls += 1;
      return next;
    },
  };
  const { code } = babel.transformFileSync(FILE, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const fakeRequire = (name) => {
    if (name === '@react-native-async-storage/async-storage') return asyncStorage;
    if (name === 'expo-crypto') return crypto;
    return require(name);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return {
    api: mod.exports,
    snapshot: () => ({ value, randomCalls, writes }),
  };
}

test('ids existentes continuam intactos depois da troca para Expo Crypto', async () => {
  const loaded = loadModule({ stored: 'legacy-device-id', ids: ['unused'] });
  assert.equal(await loaded.api.getDeviceId(), 'legacy-device-id');
  assert.deepEqual(loaded.snapshot(), { value: 'legacy-device-id', randomCalls: 0, writes: 0 });
});
test('Android cria uma unica identidade segura mesmo com chamadas concorrentes', async () => {
  const secureId = '8dd566ad-40e1-452b-b61d-d6f533ad3550';
  const loaded = loadModule({ ids: [secureId] });
  const values = await Promise.all([
    loaded.api.getDeviceId(),
    loaded.api.getDeviceId(),
    loaded.api.getDeviceId(),
  ]);
  assert.deepEqual(values, [secureId, secureId, secureId]);
  assert.deepEqual(loaded.snapshot(), { value: secureId, randomCalls: 1, writes: 1 });
});

test('a identidade nativa nunca volta para Math.random', () => {
  assert.match(source, /Crypto\.randomUUID/);
  assert.doesNotMatch(source, /Math\.random|window\.crypto/);
});
