// Regression tests for data minimisation and account deletion.
//
// Run with: node --test data-safety.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { uiLocaleFiles } = require('./test-locales');

function loadWithMocks(relativeFile, mocks) {
  const filename = require.resolve(path.join(__dirname, relativeFile));
  const originalLoad = Module._load;
  delete require.cache[filename];
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === filename && Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(filename);
  } finally {
    Module._load = originalLoad;
    delete require.cache[filename];
  }
}

function responseHarness() {
  const result = { statusCode: null, body: null };
  result.response = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  return result;
}

test('rate-limit buckets HMAC IP, email and device targets before persistence', async () => {
  const previousSecret = process.env.RATE_LIMIT_HMAC_SECRET;
  process.env.RATE_LIMIT_HMAC_SECRET = 'mutation-proof-test-secret';
  const rpcBuckets = [];
  const admin = {
    rpc: async (_name, args) => {
      rpcBuckets.push(args.p_bucket_key);
      return { data: 1, error: null };
    },
  };
  const rateLimit = loadWithMocks('./api/_lib/rateLimit.js', {
    './supabaseAdmin': { getSupabaseAdmin: () => admin },
  });

  try {
    const email = 'owner@example.test';
    const ip = '203.0.113.42';
    const deviceId = '92d78cb3-5579-4ff3-a2dc-a43cecace438';
    const first = rateLimit.opaqueBucketKey(`auth-signin-email:${email}`, 'target');
    const again = rateLimit.opaqueBucketKey(`auth-signin-email:${email}`, 'target');
    const other = rateLimit.opaqueBucketKey(`translate-device:${deviceId}`, 'target');

    assert.match(first, /^h1:[0-9a-f]{64}$/);
    assert.equal(first, again, 'the same target must keep the same counter across requests');
    assert.notEqual(first, other, 'different targets must not share a counter');
    assert.doesNotMatch(first + other, /owner@example|92d78cb3|203\.0\.113/);

    await rateLimit.checkRateLimit(
      { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } },
      responseHarness().response,
      { scope: 'identify', limit: 10, windowSeconds: 600 }
    );
    await rateLimit.checkRateLimit(
      { headers: {} },
      responseHarness().response,
      { scope: `translate-device:${deviceId}`, limit: 10, windowSeconds: 86400, ignoreIp: true }
    );

    assert.equal(rpcBuckets.length, 2);
    for (const bucket of rpcBuckets) {
      assert.match(bucket, /^h1:[0-9a-f]{64}$/);
      assert.doesNotMatch(bucket, /owner@example|92d78cb3|203\.0\.113/);
    }
  } finally {
    if (previousSecret === undefined) delete process.env.RATE_LIMIT_HMAC_SECRET;
    else process.env.RATE_LIMIT_HMAC_SECRET = previousSecret;
  }
});

test('missing HMAC secret fails open without attempting a raw database write', async () => {
  const previousHmac = process.env.RATE_LIMIT_HMAC_SECRET;
  const previousService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.RATE_LIMIT_HMAC_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let touchedDatabase = false;
  const rateLimit = loadWithMocks('./api/_lib/rateLimit.js', {
    './supabaseAdmin': {
      getSupabaseAdmin: () => {
        touchedDatabase = true;
        throw new Error('must not be reached');
      },
    },
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const allowed = await rateLimit.checkRateLimit(
      { headers: { 'x-real-ip': '198.51.100.9' } },
      responseHarness().response,
      { scope: 'ask', limit: 10, windowSeconds: 600 }
    );
    assert.equal(allowed, true, 'infrastructure failures keep the existing fail-open contract');
    assert.equal(touchedDatabase, false, 'no secret must mean no persistence, never a raw fallback');
  } finally {
    console.error = originalError;
    if (previousHmac === undefined) delete process.env.RATE_LIMIT_HMAC_SECRET;
    else process.env.RATE_LIMIT_HMAC_SECRET = previousHmac;
    if (previousService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousService;
  }
});

test('legacy fallback also prunes at 24 hours and writes only an opaque bucket', async () => {
  const previousSecret = process.env.RATE_LIMIT_HMAC_SECRET;
  process.env.RATE_LIMIT_HMAC_SECRET = 'fallback-test-secret';
  let cutoff = null;
  let stored = null;
  const admin = {
    rpc: async () => ({ data: null, error: new Error('migration not installed') }),
    from: () => ({
      delete: () => ({
        lt: async (field, value) => {
          assert.equal(field, 'window_start');
          cutoff = value;
          return { error: null };
        },
      }),
      select: () => {
        const query = {
          eq: () => query,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return query;
      },
      upsert: async (value) => {
        stored = value;
        return { error: null };
      },
    }),
  };
  const rateLimit = loadWithMocks('./api/_lib/rateLimit.js', {
    './supabaseAdmin': { getSupabaseAdmin: () => admin },
  });
  const originalError = console.error;
  console.error = () => {};
  const before = Date.now();
  try {
    const allowed = await rateLimit.checkRateLimit(
      { headers: { 'x-real-ip': '192.0.2.90' } },
      responseHarness().response,
      { scope: 'identify', limit: 10, windowSeconds: 600 }
    );
    assert.equal(allowed, true);
    const retention = before - Date.parse(cutoff);
    assert.ok(Math.abs(retention - 24 * 60 * 60 * 1000) < 2000);
    assert.match(stored.bucket_key, /^h1:[0-9a-f]{64}$/);
    assert.doesNotMatch(stored.bucket_key, /192\.0\.2\.90|identify/);
  } finally {
    console.error = originalError;
    if (previousSecret === undefined) delete process.env.RATE_LIMIT_HMAC_SECRET;
    else process.env.RATE_LIMIT_HMAC_SECRET = previousSecret;
  }
});

test('rate-limit migration rejects raw keys and prunes on every atomic increment', () => {
  const sql = fs.readFileSync(path.join(__dirname, 'supabase-migration-ratelimit.sql'), 'utf8');
  const increment = sql.slice(
    sql.indexOf('create or replace function public.increment_rate_limit'),
    sql.indexOf('create or replace function public.prune_rate_limits')
  );

  assert.match(increment, /delete from public\.rate_limits[\s\S]*interval '24 hours'/);
  assert.match(sql, /rate_limits_window_start_idx[\s\S]*\(window_start\)/);
  assert.ok(
    increment.indexOf('delete from public.rate_limits') < increment.indexOf('insert into public.rate_limits'),
    'old buckets must be pruned before each atomic increment'
  );
  assert.match(sql, /where bucket_key !~ '\^h1:\[0-9a-f\]\{64\}\$'/);
  assert.match(sql, /constraint rate_limits_bucket_key_opaque/);
  assert.match(sql, /check \(bucket_key ~ '\^h1:\[0-9a-f\]\{64\}\$'\)/);
});

async function runPushCron({ pruneData = 0, pruneError = null } = {}) {
  const rpcCalls = [];
  const admin = {
    rpc: async (name) => {
      rpcCalls.push(name);
      return { data: pruneData, error: pruneError };
    },
    from: () => {
      throw new Error('paused cron must not read push subscribers');
    },
  };
  const handler = loadWithMocks('./api/push.js', {
    './_lib/supabaseAdmin': {
      getSupabaseAdmin: () => admin,
      requireDeviceId: () => null,
    },
    './_lib/webpush': {
      sendPush: async () => {
        throw new Error('zero subscribers must never send push');
      },
    },
  });
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'cron-test-secret';
  const result = responseHarness();
  try {
    await handler(
      {
        method: 'GET',
        query: { task: 'reminders' },
        headers: { authorization: 'Bearer cron-test-secret' },
      },
      result.response
    );
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
  return { ...result, rpcCalls };
}

test('daily push cron prunes expired rate-limit buckets even with zero subscribers', async () => {
  const result = await runPushCron({ pruneData: 7 });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.rpcCalls, ['prune_rate_limits']);
  assert.deepEqual(result.body.rateLimits, { pruned: 7, error: null });
  assert.equal(result.body.total, 0);
  assert.equal(result.body.paused, 'eligibility-unavailable');
});

test('daily push cron reports an unavailable prune RPC without failing reminders', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await runPushCron({ pruneError: new Error('function does not exist') });

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body.rateLimits, { pruned: 0, error: 'unavailable' });
    assert.equal(result.body.total, 0);
    assert.equal(result.body.paused, 'eligibility-unavailable');
  } finally {
    console.error = originalError;
  }
});

function createDeletionAdmin({ email = 'owner@example.test', failTable = null } = {}) {
  const subscriptions = email
    ? [
        { device_id: 'device-a', email, provider: 'hotmart', provider_subscription_id: 'sub-1' },
        { device_id: 'device-b', email, provider: 'hotmart', provider_subscription_id: 'sub-1' },
        { device_id: 'hotmart:sub-1', email, provider: 'hotmart', provider_subscription_id: 'sub-1' },
        { device_id: 'someone-else', email: 'other@example.test', provider: null, provider_subscription_id: null },
      ]
    : [];
  const calls = [];
  let authDeleted = null;

  class Query {
    constructor(table) {
      this.table = table;
      this.operation = null;
      this.columns = null;
      this.filters = [];
    }
    select(columns) {
      this.operation = 'select';
      this.columns = columns;
      return this;
    }
    delete() {
      this.operation = 'delete';
      return this;
    }
    eq(field, value) {
      this.filters.push({ kind: 'eq', field, value });
      return this;
    }
    in(field, value) {
      this.filters.push({ kind: 'in', field, value: [...value] });
      return this;
    }
    async maybeSingle() {
      const current = subscriptions.find((row) =>
        this.filters.every((filter) => row[filter.field] === filter.value)
      );
      return { data: current || null, error: null };
    }
    execute() {
      if (this.operation === 'select') {
        const rows = subscriptions.filter((row) =>
          this.filters.every((filter) => row[filter.field] === filter.value)
        );
        return { data: rows.map((row) => ({ device_id: row.device_id })), error: null };
      }
      calls.push({ table: this.table, filters: this.filters });
      return {
        data: null,
        error: this.table === failTable ? new Error(`${failTable} unavailable`) : null,
      };
    }
    then(resolve, reject) {
      return Promise.resolve(this.execute()).then(resolve, reject);
    }
  }

  return {
    admin: {
      from: (table) => new Query(table),
      auth: {
        admin: {
          listUsers: async () => ({
            data: { users: email ? [{ id: 'auth-user', email }] : [] },
            error: null,
          }),
          deleteUser: async (id) => {
            authDeleted = id;
            return { error: null };
          },
        },
      },
    },
    calls,
    authDeleted: () => authDeleted,
  };
}

function loadAuth(admin) {
  return loadWithMocks('./api/auth.js', {
    './_lib/supabaseAdmin': {
      getSupabaseAdmin: () => admin,
      getSupabaseAnon: () => ({}),
      requireDeviceId: (req) => req.body.deviceId,
    },
    './_lib/kindwise': { requireMethod: () => true },
    './_lib/rateLimit': { checkRateLimit: async () => true },
  });
}

test('account deletion removes every device linked to the same email', async () => {
  const fake = createDeletionAdmin();
  const handler = loadAuth(fake.admin);
  const result = responseHarness();
  await handler(
    { method: 'POST', body: { action: 'delete', deviceId: 'device-a' } },
    result.response
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.deleted, true);
  const expectedIds = ['device-a', 'device-b', 'hotmart:sub-1'];
  for (const table of ['push_subscriptions', 'category_usage', 'ai_reports']) {
    const deletion = fake.calls.find((call) => call.table === table);
    assert.deepEqual(deletion?.filters, [{ kind: 'in', field: 'device_id', value: expectedIds }]);
  }
  assert.deepEqual(
    fake.calls.find((call) => call.table === 'collection_entries')?.filters,
    [{ kind: 'eq', field: 'email', value: 'owner@example.test' }]
  );
  assert.deepEqual(
    fake.calls.find((call) => call.table === 'subscriptions')?.filters,
    [{ kind: 'eq', field: 'email', value: 'owner@example.test' }]
  );
  assert.equal(fake.authDeleted(), 'auth-user');
  assert.equal(fake.calls.at(-1).table, 'subscriptions', 'account identity stays available until cleanup succeeds');
});

test('free account deletion removes current-device data including AI reports', async () => {
  const fake = createDeletionAdmin({ email: null });
  const handler = loadAuth(fake.admin);
  const result = responseHarness();
  await handler(
    { method: 'POST', body: { action: 'delete', deviceId: 'free-device' } },
    result.response
  );

  assert.equal(result.statusCode, 200);
  assert.equal(fake.calls.some((call) => call.table === 'collection_entries'), false);
  for (const table of ['push_subscriptions', 'category_usage', 'ai_reports']) {
    assert.deepEqual(
      fake.calls.find((call) => call.table === table)?.filters,
      [{ kind: 'in', field: 'device_id', value: ['free-device'] }]
    );
  }
  assert.deepEqual(
    fake.calls.find((call) => call.table === 'subscriptions')?.filters,
    [{ kind: 'eq', field: 'device_id', value: 'free-device' }]
  );
});

test('partial account deletion fails closed and keeps the account key retryable', async () => {
  const fake = createDeletionAdmin({ failTable: 'ai_reports' });
  const handler = loadAuth(fake.admin);
  const result = responseHarness();
  const originalError = console.error;
  console.error = () => {};
  try {
    await handler(
      { method: 'POST', body: { action: 'delete', deviceId: 'device-a' } },
      result.response
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.reason, 'deleteFailed');
  assert.equal(
    fake.calls.some((call) => call.table === 'subscriptions'),
    false,
    'subscription rows must survive so an idempotent retry can rediscover every device'
  );
  assert.equal(fake.authDeleted(), null);
});

test('photo upload reaches identify only from the affirmative consent button', () => {
  const source = fs.readFileSync(path.join(__dirname, 'screens', 'IdentifyScreen.js'), 'utf8');
  const pulse = fs.readFileSync(path.join(__dirname, 'components', 'LensPulseButton.js'), 'utf8');
  const section = (start, end) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `secao ausente: ${start}`);
    return source.slice(from, to);
  };

  const remote = section('const runIdentification =', 'const requestPhotoConsent =');
  const consent = section('const requestPhotoConsent =', 'const storePhotoInSlot =');
  const camera = section('const capturePhotoForSlot =', 'const choosePhotoForSlot =');
  const library = section('const choosePhotoForSlot =', 'const removePhotoFromSlot =');

  for (const category of ['plant', 'tree', 'insect', 'mushroom', 'crop']) {
    assert.match(
      source,
      new RegExp(`${category}: 'photoConsentKindwiseBody'`),
      `${category} precisa divulgar Kindwise antes do envio`
    );
  }
  assert.match(source, /fish: 'photoConsentFishialBody'/);
  assert.match(source, /bird: 'photoConsentBirdBody'/);

  assert.match(consent, /showAlert\(t\('identify\.photoConsentTitle'\)/);
  assert.match(consent, /\{ text: t\('common\.cancel'\), style: 'cancel' \}/);
  assert.match(
    consent,
    /text: t\('identify\.photoConsentSend'\)[\s\S]*onPress: runIdentification/,
    'somente o botao afirmativo pode iniciar a identificacao'
  );

  for (const [name, handler] of [['camera', camera], ['galeria', library]]) {
    assert.match(handler, /prepareForUpload/, `${name} deve preparar a foto localmente`);
    assert.match(handler, /storePhotoInSlot/, `${name} deve apenas colocar a foto na bandeja`);
    assert.doesNotMatch(handler, /requestPhotoConsent|runIdentification|await identify/,
      `${name} nao pode enviar antes da revisao e do consentimento`);
  }

  assert.match(source, /<LensPulseButton[\s\S]*onComplete=\{requestPhotoConsent\}/,
    'a bandeja revisada precisa do gesto afirmativo antes do consentimento');
  assert.doesNotMatch(pulse, /runIdentification|await identify/,
    'o gesto sensorial nao pode contornar a divulgacao do fornecedor');
  assert.match(source, /const runIdentification = async \(\) =>/);
  assert.equal(
    (source.match(/\brunIdentification\(/g) || []).length,
    0,
    'nenhum controle pode invocar a rede contornando o callback afirmativo'
  );
  assert.equal(
    (source.match(/await identify\(category,/g) || []).length,
    1,
    'a chamada remota deve continuar centralizada em runIdentification'
  );
  assert.match(
    remote,
    /identify\(category, photos\.map\(\(photo\) => photo\.base64\)\)/,
    'o consentimento nao pode remover a bandeja revisada de ate tres fotos'
  );
});

test('all 17 locales carry complete vendor-specific photo consent keys', () => {
  const files = uiLocaleFiles();
  assert.equal(files.length, 17);

  for (const file of files) {
    const locale = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'public', 'locales', file), 'utf8')
    );
    const identify = locale.identify || {};
    for (const key of [
      'photoConsentTitle',
      'photoConsentKindwiseBody',
      'photoConsentFishialBody',
      'photoConsentNyckelBody',
      'photoConsentBirdBody',
      'photoConsentSend',
    ]) {
      assert.ok(
        typeof identify[key] === 'string' && identify[key].trim(),
        `${file}: identify.${key} precisa existir no proprio idioma`
      );
    }

    assert.match(identify.photoConsentKindwiseBody, /Kindwise/);
    assert.match(identify.photoConsentKindwiseBody, /6/);
    assert.match(identify.photoConsentKindwiseBody, /CC[- ]BY[- ]SA/i);
    assert.match(identify.photoConsentFishialBody, /Fishial/);
    assert.match(identify.photoConsentNyckelBody, /Nyckel/);
    assert.match(identify.photoConsentBirdBody, /BioCLIP/);
    assert.match(identify.photoConsentBirdBody, /Nyckel/);
  }

  const en = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'public', 'locales', 'en.json'), 'utf8')
  ).identify;
  assert.match(en.photoConsentKindwiseBody, /selected photos/i);
  assert.match(en.photoConsentKindwiseBody, /photos and results[\s\S]*6 months/i);
  assert.match(en.photoConsentKindwiseBody, /irrevocable license/i);
  assert.match(en.photoConsentKindwiseBody, /training and commercial purposes/i);
  assert.match(en.photoConsentKindwiseBody, /other customers/i);
  assert.match(en.photoConsentFishialBody, /does not publish a specific retention period/i);
  assert.match(en.photoConsentNyckelBody, /selected photos[\s\S]*processed/i);
  assert.match(en.photoConsentBirdBody, /only in memory/i);
  assert.match(en.photoConsentBirdBody, /(?:(?:not|nor) retained|without retention)/i);
  assert.match(en.photoConsentBirdBody, /(?:disabled|fails|cannot prove)[\s\S]*Nyckel/i);
  assert.doesNotMatch(
    `${en.photoConsentFishialBody} ${en.photoConsentNyckelBody}`,
    /ephemeral|deleted immediately|not retained/i,
    'Fishial e Nyckel nao publicam base para prometer efemeridade'
  );
});

test('Nyckel bird invoke explicitly disables sample capture', async () => {
  const previousId = process.env.NYCKEL_CLIENT_ID;
  const previousSecret = process.env.NYCKEL_CLIENT_SECRET;
  const previousFetch = global.fetch;
  const filename = require.resolve(path.join(__dirname, 'api', '_lib', 'nyckel.js'));
  const calls = [];

  process.env.NYCKEL_CLIENT_ID = 'test-client';
  process.env.NYCKEL_CLIENT_SECRET = 'test-secret';
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/connect/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'token' }) };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ labelName: 'Bird', confidence: 0.9 }),
    };
  };

  delete require.cache[filename];
  try {
    const { nyckelIdentify } = require(filename);
    const result = await nyckelIdentify({
      res: responseHarness().response,
      image: 'base64-photo',
      functionId: 'bird-function',
    });

    assert.equal(result.labelName, 'Bird');
    assert.equal(calls.length, 2);
    assert.equal(
      calls[1].url,
      'https://www.nyckel.com/v1/functions/bird-function/invoke?capture=false',
      'sem capture=false o Nyckel captura o invoke como amostra por padrao'
    );
    assert.equal(calls[1].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[1].init.body), {
      data: 'data:image/jpeg;base64,base64-photo',
    });
  } finally {
    global.fetch = previousFetch;
    delete require.cache[filename];
    if (previousId === undefined) delete process.env.NYCKEL_CLIENT_ID;
    else process.env.NYCKEL_CLIENT_ID = previousId;
    if (previousSecret === undefined) delete process.env.NYCKEL_CLIENT_SECRET;
    else process.env.NYCKEL_CLIENT_SECRET = previousSecret;
  }
});
