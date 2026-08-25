const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

function loadRecovery() {
  const { code } = babel.transformFileSync(
    path.join(__dirname, 'components', 'appRecovery.js'),
    { presets: ['babel-preset-expo'] },
  );
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}

const { recoverWebApp, recoveryUrl } = loadRecovery();

test('recuperacao online busca a versao atual sem apagar dados nem caches', async () => {
  const calls = { fetch: [], update: 0, replace: [], reload: 0 };
  const locationImpl = {
    origin: 'https://naturelensapp.cloud',
    href: 'https://naturelensapp.cloud/?source=pwa',
    replace: (url) => calls.replace.push(url),
    reload: () => { calls.reload += 1; },
  };

  const recovered = await recoverWebApp({
    fetchImpl: async (...args) => {
      calls.fetch.push(args);
      return { ok: true };
    },
    navigatorImpl: {
      serviceWorker: {
        getRegistration: async () => ({ update: async () => { calls.update += 1; } }),
      },
    },
    locationImpl,
    now: () => 42,
  });

  assert.equal(recovered, true);
  assert.match(calls.fetch[0][0], /nl_recovery_probe=42$/);
  assert.deepEqual(calls.fetch[0][1], { cache: 'no-store' });
  assert.equal(calls.update, 1);
  assert.deepEqual(calls.replace, ['https://naturelensapp.cloud/?source=pwa&nl_recover=42']);
  assert.equal(calls.reload, 0);
});

test('recuperacao offline preserva o shell existente', async () => {
  const calls = { update: 0, replace: 0, reload: 0 };
  const recovered = await recoverWebApp({
    fetchImpl: async () => { throw new Error('offline'); },
    navigatorImpl: {
      serviceWorker: {
        getRegistration: async () => ({ update: async () => { calls.update += 1; } }),
      },
    },
    locationImpl: {
      origin: 'https://naturelensapp.cloud',
      href: 'https://naturelensapp.cloud/',
      replace: () => { calls.replace += 1; },
      reload: () => { calls.reload += 1; },
    },
    now: () => 43,
  });

  assert.equal(recovered, false);
  assert.deepEqual(calls, { update: 0, replace: 0, reload: 1 });
});

test('URL de recuperacao conserva parametros existentes', () => {
  assert.equal(
    recoveryUrl('https://naturelensapp.cloud/?source=home#result', 44),
    'https://naturelensapp.cloud/?source=home&nl_recover=44#result',
  );
});
