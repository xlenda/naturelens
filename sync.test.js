// Guards on cloud sync of the collection.
//
// The collection is the one thing in this app a user cannot get back. Every
// rule below exists so that adding sync cannot become a second way to lose it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

function loadStorage(initial, extraRequires = {}, storageOptions = {}) {
  const babel = require('@babel/core');
  let value = JSON.stringify(initial);
  let writes = 0;
  const asyncStorage = {
    getItem: async () => value,
    setItem: async (_key, next) => {
      writes += 1;
      if (storageOptions.failSet) throw new Error('storage full');
      value = next;
    },
    removeItem: async () => {
      value = null;
    },
  };
  const { code } = babel.transformFileSync(path.join(__dirname, 'components', 'storage.js'), {
    presets: ['babel-preset-expo'],
  });
  const mod = { exports: {} };
  const fakeRequire = (name) => {
    if (name in extraRequires) return extraRequires[name];
    if (name === '@react-native-async-storage/async-storage') return asyncStorage;
    if (name === 'expo-crypto') return { randomUUID: require('node:crypto').randomUUID };
    if (name === './localReminders') return { isNativeReminderAvailable: () => false };
    if (name === './watering') {
      return {
        getWateringStatus: (entry) => (
          ['Low (prefers dry soil)', 'Medium', 'High (prefers moist soil)'].includes(entry?.water)
          && Number.isFinite(Date.parse(entry?.lastWateredAt)) ? {} : null
        ),
      };
    }
    return require(name);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return { storage: mod.exports, read: () => (value ? JSON.parse(value) : []), writes: () => writes };
}

function loadCollectionSync({ local = [], pending = [], replaceResult = [], responseData, beforeResponse }) {
  const babel = require('@babel/core');
  const values = new Map([
    ['@naturelens/pending_deletes', JSON.stringify(pending)],
  ]);
  const asyncStorage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  let requestBody = null;
  let replacedEntries = null;
  const readLocal = async () => {
    const current = typeof local === 'function' ? await local() : local;
    return JSON.parse(JSON.stringify(current));
  };
  const fakeFetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    if (beforeResponse) await beforeResponse({ values, requestBody });
    return {
      ok: true,
      json: async () => responseData,
    };
  };
  const { code } = babel.transformFileSync(path.join(__dirname, 'components', 'collectionSync.js'), {
    presets: ['babel-preset-expo'],
  });
  const mod = { exports: {} };
  const fakeRequire = (name) => {
    if (name === '@react-native-async-storage/async-storage') return asyncStorage;
    if (name === './storage') {
      return {
        getCollection: readLocal,
        replaceCollection: async (entries) => {
          replacedEntries = entries;
          return typeof replaceResult === 'function' ? replaceResult(entries) : replaceResult;
        },
      };
    }
    if (name === './deviceId') return { getDeviceId: async () => 'device-test' };
    if (name === './apiBase') return { API_BASE: 'https://example.test' };
    if (name === './collectionMerge') return require('./components/collectionMerge');
    return require(name);
  };
  new Function('module', 'exports', 'require', 'fetch', code)(mod, mod.exports, fakeRequire, fakeFetch);
  return {
    sync: mod.exports,
    values,
    requestBody: () => requestBody,
    replacedEntries: () => replacedEntries,
  };
}

function loadCollectionApi(admin) {
  const source = read('api/collection.js');
  const mod = { exports: {} };
  const fakeRequire = (name) => {
    if (name === './_lib/supabaseAdmin') {
      return { getSupabaseAdmin: () => admin, requireDeviceId: () => 'device-test' };
    }
    if (name === './_lib/rateLimit') return { checkRateLimit: async () => true };
    if (name === '../components/collectionMerge') return require('./components/collectionMerge');
    if (name === '../components/taxonIdentity') return require('./components/taxonIdentity');
    return require(name);
  };
  new Function('module', 'exports', 'require', source)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

function responseHarness() {
  const result = { statusCode: null, body: null, headers: {} };
  result.response = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
    setHeader(name, value) {
      result.headers[name] = value;
    },
  };
  return result;
}

function createCollectionAdmin({ rows = [], failTombstones = false, beforeCasUpdate } = {}) {
  const keyFor = (row) => `${row.email || 'owner@example.test'}\u0000${row.saved_id}`;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const state = new Map(rows.map((row) => [keyFor(row), clone({ email: 'owner@example.test', ...row })]));
  const calls = [];
  let casHookUsed = false;

  class Query {
    constructor(table) {
      this.table = table;
      this.operation = null;
      this.values = null;
      this.options = null;
      this.filters = [];
      this.orders = [];
      this.maxRows = null;
      this.returning = false;
    }

    select() {
      if (!this.operation) this.operation = 'select';
      else this.returning = true;
      return this;
    }

    update(values) {
      this.operation = 'update';
      this.values = values;
      return this;
    }

    upsert(values, options) {
      this.operation = 'upsert';
      this.values = Array.isArray(values) ? values : [values];
      this.options = options || {};
      return this;
    }

    eq(field, value) {
      this.filters.push({ kind: 'eq', field, value });
      return this;
    }

    in(field, values) {
      this.filters.push({ kind: 'in', field, values });
      return this;
    }

    gt(field, value) {
      this.filters.push({ kind: 'gt', field, value });
      return this;
    }

    order(field, options = {}) {
      this.orders.push({ field, ascending: options.ascending !== false });
      return this;
    }

    limit(value) {
      this.maxRows = value;
      return this;
    }

    async maybeSingle() {
      return { data: { email: 'owner@example.test', status: 'active' }, error: null };
    }

    matchingRows() {
      let found = Array.from(state.values());
      for (const filter of this.filters) {
        if (filter.kind === 'eq') found = found.filter((row) => row[filter.field] === filter.value);
        if (filter.kind === 'in') found = found.filter((row) => filter.values.includes(row[filter.field]));
        if (filter.kind === 'gt') found = found.filter((row) => row[filter.field] > filter.value);
      }
      for (const order of this.orders.slice().reverse()) {
        found.sort((a, b) => {
          const direction = order.ascending ? 1 : -1;
          return String(a[order.field]).localeCompare(String(b[order.field])) * direction;
        });
      }
      return this.maxRows === null ? found : found.slice(0, this.maxRows);
    }

    async execute() {
      if (this.operation === 'select') {
        const data = this.matchingRows().map(clone);
        calls.push({ operation: 'select', filters: clone(this.filters), count: data.length });
        return { data, error: null };
      }

      if (this.operation === 'upsert') {
        const tombstones = this.values.some((row) => row.deleted === true);
        calls.push({ operation: 'upsert', tombstones, options: this.options, count: this.values.length });
        if (tombstones && failTombstones) {
          return { data: null, error: { message: 'tombstone write failed' } };
        }
        for (const value of this.values) {
          const key = keyFor(value);
          if (state.has(key) && this.options.ignoreDuplicates) continue;
          state.set(key, clone({ ...(state.get(key) || {}), ...value }));
        }
        return { data: null, error: null };
      }

      if (this.operation === 'update') {
        if (!casHookUsed && beforeCasUpdate) {
          casHookUsed = true;
          beforeCasUpdate({ state, keyFor, clone });
        }
        const matched = this.matchingRows();
        for (const row of matched) {
          const key = keyFor(row);
          state.set(key, clone({ ...row, ...this.values }));
        }
        calls.push({ operation: 'update', filters: clone(this.filters), count: matched.length });
        return {
          data: this.returning ? matched.map((row) => ({ saved_id: row.saved_id })) : null,
          error: null,
        };
      }

      throw new Error(`unsupported fake query: ${this.table} ${this.operation}`);
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  return {
    from: (table) => new Query(table),
    calls,
    row(savedId) {
      return state.get(`owner@example.test\u0000${savedId}`);
    },
  };
}

test("the user's own photo is never uploaded", () => {
  // The privacy policy states plainly that we do not store photos on any server
  // we control. It is also 300 KB per find against ~1 KB of metadata. The
  // server, not the client, decides what is kept - so a modified or buggy client
  // cannot upload what the policy says is never uploaded.
  const api = read('api/collection.js');
  const start = api.indexOf('const SYNCED_FIELDS');
  const fields = api.slice(start, api.indexOf('];', start));
  assert.doesNotMatch(fields, /photoUri/, 'photoUri must never be in the synced field list');
  assert.match(api, /function sanitiseEntry/, 'entries must be filtered server-side, not trusted');
});

test('backup restore writes the same collection the app reads', () => {
  const storage = read('components/storage.js');
  const backup = read('components/collectionBackup.js');
  assert.match(storage, /export const COLLECTION_KEY = '@plantid_collection'/);
  assert.match(backup, /import \{ COLLECTION_KEY, getCollection \} from '\.\/storage'/);
  assert.doesNotMatch(backup, /@naturelens_collection/);
  assert.match(backup, /mergeCollections\(current, parsed\.items, new Set\(\)\)/);
});

test('a nickname survives sync', () => {
  // The nickname is the user's own name for a find ("the balcony fern"). If
  // the server filter strips it, a restore on a new device silently returns a
  // collection that no longer feels like theirs - and nothing would error.
  const api = read('api/collection.js');
  const start = api.indexOf('const SYNCED_FIELDS');
  const fields = api.slice(start, api.indexOf('];', start));
  assert.match(fields, /'nickname'/, 'nickname must be in the synced field list');

  // And the collection screen must actually let the user search by it - a
  // nickname that cannot find its own find defeats the point of naming it.
  const screen = read('screens/CollectionScreen.js');
  assert.match(screen, /item\.nickname \|\| ''\)\.toLowerCase\(\)\.includes/, 'search must match nicknames');
});

test('garden metadata survives the server filter', () => {
  const api = read('api/collection.js');
  const start = api.indexOf('const SYNCED_FIELDS');
  const fields = api.slice(start, api.indexOf('];', start));
  for (const field of ['room', 'lastWateredAt', 'updatedAt']) {
    assert.match(fields, new RegExp(`'${field}'`), `${field} must survive sync`);
  }
});

test('risk, diagnosis and translated fish metadata survive sync', () => {
  const { sanitiseEntry } = require('./api/collection');
  const safe = sanitiseEntry({
    savedId: 'risk-1',
    category: 'mushroom',
    edibility: 'deadly',
    edibilityLabel: 'mortal',
    psychoactive: true,
    lookAlike: ['Amanita caesarea'],
    danger: ['highly venomous'],
    dangerLabel: ['altamente venenoso'],
    dangerDescription: 'Full warning',
    role: ['pollinator'],
    taxonClass: 'Arachnida',
    taxonPhylum: 'Arthropoda',
    family: 'Amanitaceae',
    ord: 'Agaricales',
    overviewIsProse: true,
    overviewOriginal: 'Original English paragraph.',
    overviewCitation: 'https://example.test/source',
    overviewLicense: 'CC BY-SA 4.0',
    overviewLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceProvider: 'mushroom.id',
    resultLanguage: 'pt',
    subjectProbability: 0.91,
    gbifId: '8168319',
    displayName: 'Canto de ave',
    healthAssessed: true,
    healthScientific: 'Zea mays',
    healthCheckedAt: '2026-08-19T12:30:00.000Z',
    healthSourceProvider: 'crop.health',
    healthResultLanguage: 'pt',
    lookAlikeDetails: [{ name: 'Amanita caesarea', entity_id: 'gbif:5240300' }],
    disease: {
      severity: 'high',
      severityLabel: 'alta',
      symptoms: ['leaf spot'],
      treatment: { prevention: ['remove affected tissue'] },
    },
    alternatives: [{ name: 'Another species', confidence: 20 }],
    photoUri: 'file:///private-user-photo.jpg',
  });

  assert.ok(safe, 'the entry must not be rejected for carrying structured safety data');
  assert.equal(safe.payload.edibility, 'deadly');
  assert.equal(safe.payload.edibilityLabel, 'mortal');
  assert.deepEqual(safe.payload.lookAlike, ['Amanita caesarea']);
  assert.deepEqual(safe.payload.danger, ['highly venomous']);
  assert.deepEqual(safe.payload.dangerLabel, ['altamente venenoso']);
  assert.equal(safe.payload.taxonClass, 'Arachnida');
  assert.equal(safe.payload.taxonPhylum, 'Arthropoda');
  assert.equal(safe.payload.psychoactive, true);
  assert.equal(safe.payload.disease.severity, 'high');
  assert.deepEqual(safe.payload.disease.treatment.prevention, ['remove affected tissue']);
  assert.equal(safe.payload.overviewIsProse, true);
  assert.equal(safe.payload.overviewOriginal, 'Original English paragraph.');
  assert.equal(safe.payload.overviewCitation, 'https://example.test/source');
  assert.equal(safe.payload.overviewLicense, 'CC BY-SA 4.0');
  assert.equal(safe.payload.sourceProvider, 'mushroom.id');
  assert.equal(safe.payload.resultLanguage, 'pt');
  assert.equal(safe.payload.subjectProbability, 0.91);
  assert.equal(safe.payload.gbifId, '8168319');
  assert.equal(safe.payload.displayName, 'Canto de ave');
  assert.equal(safe.payload.healthAssessed, true);
  assert.equal(safe.payload.healthScientific, 'Zea mays');
  assert.equal(safe.payload.healthCheckedAt, '2026-08-19T12:30:00.000Z');
  assert.equal(safe.payload.healthSourceProvider, 'crop.health');
  assert.equal(safe.payload.healthResultLanguage, 'pt');
  assert.equal(safe.payload.lookAlikeDetails[0].entity_id, 'gbif:5240300');
  assert.equal(safe.payload.photoUri, undefined, 'the user photo remains local-only');
});

test('sync bounds nested arrays and refuses executable values', () => {
  const { sanitiseEntry } = require('./api/collection');
  const safe = sanitiseEntry({
    savedId: 'bounded',
    category: 'insect',
    danger: Array.from({ length: 40 }, (_, i) => `risk-${i}`),
    disease: { treatment: { prevention: ['one'], callback: () => 'nope' } },
  });
  assert.equal(safe.payload.danger.length, 20);
  assert.equal(safe.payload.disease.treatment.callback, undefined);
});

test('updating an entry gives the edit a fresh timestamp', async () => {
  const old = '2026-08-19T10:00:00.000Z';
  const { storage, read: readStored } = loadStorage([
    { savedId: 'one', nickname: 'old', updatedAt: old },
  ]);
  const before = Date.now();
  await storage.updateCollectionEntry('one', { nickname: 'new' });
  const after = Date.now();
  const [entry] = readStored();
  assert.equal(entry.nickname, 'new');
  assert.ok(Date.parse(entry.updatedAt) >= before && Date.parse(entry.updatedAt) <= after);
});

test('a collection entry is addressed only by savedId and missing updates fail honestly', async () => {
  const { storage, read: readStored, writes } = loadStorage([
    { savedId: 'first', id: 'same-species', nickname: 'A', updatedAt: '2026-08-18T10:00:00.000Z' },
    { savedId: 'second', id: 'same-species', nickname: 'B', updatedAt: '2026-08-18T10:00:00.000Z' },
  ]);

  assert.equal((await storage.getCollectionEntry('second')).nickname, 'B');
  assert.equal(await storage.getCollectionEntry('missing'), null);
  assert.equal(await storage.updateCollectionEntry('missing', { nickname: 'ghost' }), null);
  assert.equal(writes(), 0, 'a missing entry must not report success or rewrite storage');

  const firstEdit = storage.updateCollectionEntry('first', { nickname: 'Fern' });
  const secondEdit = storage.updateCollectionEntry('first', { room: 'Office' });
  await Promise.all([firstEdit, secondEdit]);
  const [first, second] = readStored();
  assert.equal(first.nickname, 'Fern');
  assert.equal(first.room, 'Office', 'concurrent patches for one savedId must not lose each other');
  assert.equal(second.nickname, 'B', 'another specimen of the same species must stay untouched');
});

test('double tapping save shares one promise and creates one UUID entry', async () => {
  const { storage, read: readStored } = loadStorage([]);
  const plant = { id: 'species-1', category: 'plant', name: 'Fern' };
  const first = storage.saveToCollection(plant);
  const second = storage.saveToCollection({ ...plant });
  assert.equal(first, second, 'the same in-flight save must return the same promise');
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.savedId, b.savedId);
  assert.match(a.savedId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(readStored().length, 1);
});

test('concurrent saves of different finds preserve both identities', async () => {
  const { storage, read: readStored } = loadStorage([]);
  const first = storage.saveToCollection({
    id: 'species-1',
    category: 'insect',
    name: 'Monarch butterfly',
    photoUri: 'file:///first.jpg',
  });
  const second = storage.saveToCollection({
    id: 'species-2',
    category: 'fish',
    name: 'Clownfish',
    photoUri: 'file:///second.jpg',
  });

  assert.notEqual(first, second, 'different finds must never share an in-flight save');
  const [insect, fish] = await Promise.all([first, second]);
  assert.notEqual(insect.savedId, fish.savedId);
  assert.equal(readStored().length, 2);
  assert.deepEqual(
    new Set(readStored().map((entry) => entry.name)),
    new Set(['Monarch butterfly', 'Clownfish'])
  );
});

test('legacy duplicate savedIds are repaired without deleting either specimen', async () => {
  const { storage, read: readStored } = loadStorage([
    { savedId: 'collision', category: 'plant', name: 'First' },
    { savedId: 'collision', category: 'plant', name: 'Second' },
  ]);
  const migrated = await storage.getCollection();
  assert.equal(migrated.length, 2);
  assert.equal(migrated[0].savedId, 'collision');
  assert.notEqual(migrated[1].savedId, 'collision');
  assert.equal(new Set(migrated.map((entry) => entry.savedId)).size, 2);

  const remaining = await storage.removeFromCollection('collision');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].name, 'Second');
  assert.equal(readStored().length, 1);
});

test('corrupted null collection entries are repaired before screens read savedId', async () => {
  const { storage, read: readStored } = loadStorage([
    null,
    { savedId: 'ok', category: 'plant', name: 'Fern' },
    { category: 'fish', name: 'Guppy' },
  ]);
  const migrated = await storage.getCollection();
  assert.equal(migrated.length, 2);
  assert.equal(migrated[0].savedId, 'ok');
  assert.ok(migrated.every((entry) => entry && typeof entry.savedId === 'string'));
  assert.deepEqual(readStored(), migrated);
});

test('a specimen note is trimmed, capped and erased as an empty synced value', async () => {
  const old = '2026-08-18T10:00:00.000Z';
  const { storage, read: readStored } = loadStorage([
    { savedId: 'note', category: 'plant', specimenNote: 'old', updatedAt: old },
  ]);
  await storage.updateCollectionEntry('note', { specimenNote: `  ${'x'.repeat(600)}  ` });
  let [entry] = readStored();
  assert.equal(entry.specimenNote.length, 500);
  assert.ok(Date.parse(entry.specimenNoteUpdatedAt) > Date.parse(old));
  assert.equal(entry.specimenNoteUpdatedAt, entry.updatedAt);

  await storage.updateCollectionEntry('note', { specimenNote: null });
  [entry] = readStored();
  assert.equal(entry.specimenNote, '', 'empty notes need a value the server sanitizer preserves');
  assert.ok(Date.parse(entry.specimenNoteUpdatedAt) > Date.parse(old));
});

test('watering persists before success and rejects unsupported specimens', async () => {
  const valid = { savedId: 'plant', category: 'plant', water: 'Medium' };
  const fauna = { savedId: 'bird', category: 'bird', water: 'Medium' };
  const { storage, read: readStored } = loadStorage([valid, fauna]);
  const result = await storage.markCollectionWatered('plant', '2026-08-20T12:00:00.000Z');
  assert.equal(result.lastWateredAt, '2026-08-20T12:00:00.000Z');
  assert.equal(result.entries.find((entry) => entry.savedId === 'plant').lastWateredAt, result.lastWateredAt);
  assert.equal(readStored().find((entry) => entry.savedId === 'plant').lastWateredAt, result.lastWateredAt);
  assert.equal(await storage.markCollectionWatered('bird'), null);
  assert.equal(await storage.markCollectionWatered('missing'), null);
  assert.equal(await storage.markCollectionWatered('plant', 'tomorrow-ish'), null);

  const failing = loadStorage([valid], {}, { failSet: true });
  assert.equal(await failing.storage.markCollectionWatered('plant'), null);
  assert.equal(failing.read()[0].lastWateredAt, undefined, 'failed persistence cannot advance visual state');
});

test('removing an entry waits until its tombstone is durable', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let finished = false;
  const { storage } = loadStorage(
    [{ savedId: 'one', category: 'plant' }],
    { './collectionSync': { rememberDeletion: async () => gate } }
  );

  const removal = storage.removeFromCollection('one').then((result) => {
    finished = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false, 'removeFromCollection returned before rememberDeletion finished');
  release();
  assert.deepEqual(await removal, []);
  assert.equal(finished, true);
});

test('a specimen is never deleted while its Android reminders are still active', async () => {
  const calls = [];
  const reminders = {
    isNativeReminderAvailable: () => true,
    cancelRemindersForSavedId: async (savedId) => {
      calls.push(`cancel:${savedId}`);
      return { ok: false, status: 'error' };
    },
  };
  const env = loadStorage(
    [{ savedId: '1724238000000', category: 'plant' }],
    {
      './localReminders': reminders,
      './collectionSync': { rememberDeletion: async () => calls.push('tombstone') },
    },
  );

  assert.equal(await env.storage.removeFromCollection('1724238000000'), null);
  assert.deepEqual(calls, ['cancel:1724238000000']);
  assert.equal(env.read().length, 1, 'failed cancellation keeps the specimen visible');
});

test('clearing personal data cancels every local reminder first', async () => {
  const calls = [];
  const env = loadStorage(
    [{ savedId: '1724238000000', category: 'plant' }],
    {
      './localReminders': {
        isNativeReminderAvailable: () => true,
        clearLocalReminders: async () => {
          calls.push('clear-reminders');
          return { ok: false, status: 'error' };
        },
      },
    },
  );

  assert.equal(await env.storage.clearCollection(), false);
  assert.deepEqual(calls, ['clear-reminders']);
  assert.equal(env.read().length, 1, 'personal data remains until reminder cleanup can be confirmed');
});

test('newer remote metadata wins without losing local-only data', () => {
  const { mergeCollections } = require('./components/collectionMerge');
  const local = [{
    savedId: 'one', room: 'Kitchen', lastWateredAt: '2026-08-18T10:00:00.000Z',
    updatedAt: '2026-08-18T10:00:00.000Z', photoUri: 'file:///private.jpg', localDraft: 'keep me',
  }];
  const remote = [{
    savedId: 'one', room: 'Balcony', lastWateredAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
  }];
  const result = mergeCollections(local, remote, new Set());
  assert.equal(result.entries[0].room, 'Balcony');
  assert.equal(result.entries[0].lastWateredAt, '2026-08-20T10:00:00.000Z');
  assert.equal(result.entries[0].photoUri, 'file:///private.jpg');
  assert.equal(result.entries[0].localDraft, 'keep me');
  assert.equal(result.updated, 1, 'the caller must be able to refresh the UI after a remote edit');
});

test('a newer local note survives a newer remote watering edit and is repushed', () => {
  const { mergeCollections } = require('./components/collectionMerge');
  const local = [{
    savedId: 'one', specimenNote: 'keep local note',
    specimenNoteUpdatedAt: '2026-08-20T13:00:00.000Z',
    lastWateredAt: '2026-08-18T10:00:00.000Z', updatedAt: '2026-08-18T10:00:00.000Z',
  }];
  const remote = [{
    savedId: 'one', specimenNote: 'stale remote note',
    specimenNoteUpdatedAt: '2026-08-18T10:00:00.000Z',
    lastWateredAt: '2026-08-20T12:00:00.000Z', updatedAt: '2026-08-20T12:00:00.000Z',
  }];
  const [merged] = mergeCollections(local, remote, new Set()).entries;
  assert.equal(merged.specimenNote, 'keep local note');
  assert.equal(merged.lastWateredAt, '2026-08-20T12:00:00.000Z');
  assert.ok(
    Date.parse(merged.updatedAt) > Date.parse(merged.specimenNoteUpdatedAt),
    'the combined entry needs a fresh general clock so the winning local note is pushed back'
  );
});

test('a newer remote note survives a newer local watering edit', () => {
  const { mergeCollections } = require('./components/collectionMerge');
  const local = [{
    savedId: 'one', specimenNote: 'stale local note',
    specimenNoteUpdatedAt: '2026-08-18T10:00:00.000Z',
    lastWateredAt: '2026-08-20T13:00:00.000Z', updatedAt: '2026-08-20T13:00:00.000Z',
  }];
  const remote = [{
    savedId: 'one', specimenNote: 'keep remote note',
    specimenNoteUpdatedAt: '2026-08-20T12:00:00.000Z',
    lastWateredAt: '2026-08-18T10:00:00.000Z', updatedAt: '2026-08-20T12:00:00.000Z',
  }];
  const result = mergeCollections(local, remote, new Set());
  const [merged] = result.entries;
  assert.equal(merged.specimenNote, 'keep remote note');
  assert.equal(merged.lastWateredAt, '2026-08-20T13:00:00.000Z');
  assert.ok(Date.parse(merged.updatedAt) > Date.parse(local[0].updatedAt));
  assert.equal(result.updated, 1, 'an independent remote note edit must refresh the UI');
});

test('equal note timestamps converge regardless of merge direction', () => {
  const { mergeCollections } = require('./components/collectionMerge');
  const timestamp = '2026-08-20T12:00:00.000Z';
  const a = { savedId: 'one', specimenNote: 'alpha', specimenNoteUpdatedAt: timestamp, updatedAt: timestamp };
  const b = { savedId: 'one', specimenNote: 'zulu', specimenNoteUpdatedAt: timestamp, updatedAt: timestamp };
  const ab = mergeCollections([a], [b], new Set()).entries[0];
  const ba = mergeCollections([b], [a], new Set()).entries[0];
  assert.equal(ab.specimenNote, 'zulu');
  assert.equal(ba.specimenNote, 'zulu');
  assert.equal(ab.specimenNoteUpdatedAt, ba.specimenNoteUpdatedAt);
});

test('equal general timestamps converge without choosing by local photo', () => {
  const { mergeCollections } = require('./components/collectionMerge');
  const timestamp = '2026-08-20T12:00:00.000Z';
  const a = { savedId: 'one', room: 'Alpha', nickname: 'Fern', updatedAt: timestamp, photoUri: 'file:///a.jpg' };
  const b = { savedId: 'one', room: 'Zulu', nickname: 'Palm', updatedAt: timestamp, photoUri: 'file:///b.jpg' };
  const ab = mergeCollections([a], [{ ...b, photoUri: undefined }], new Set()).entries[0];
  const ba = mergeCollections([b], [{ ...a, photoUri: undefined }], new Set()).entries[0];
  assert.equal(ab.room, ba.room);
  assert.equal(ab.nickname, ba.nickname);
  assert.equal(ab.photoUri, 'file:///a.jpg');
  assert.equal(ba.photoUri, 'file:///b.jpg');
});

test('specimen notes survive the server filter including deletion', () => {
  const { sanitiseEntry } = require('./api/collection');
  const timestamp = '2026-08-20T12:00:00.000Z';
  const saved = sanitiseEntry({
    savedId: 'note', category: 'plant', specimenNote: 'x'.repeat(600), specimenNoteUpdatedAt: timestamp,
  });
  assert.equal(saved.payload.specimenNote.length, 500);
  assert.equal(saved.payload.specimenNoteUpdatedAt, timestamp);

  const erasedWithEmpty = sanitiseEntry({
    savedId: 'note', category: 'plant', specimenNote: '', specimenNoteUpdatedAt: timestamp,
  });
  assert.equal(erasedWithEmpty.payload.specimenNote, '');
  const erasedWithNull = sanitiseEntry({
    savedId: 'note', category: 'plant', specimenNote: null, specimenNoteUpdatedAt: timestamp,
  });
  assert.equal(erasedWithNull.payload.specimenNote, '', 'older/null clients must erase instead of dropping the field');
  const invalidClock = sanitiseEntry({
    savedId: 'note', category: 'plant', specimenNote: 'safe', specimenNoteUpdatedAt: 'August 20, 2026',
  });
  assert.equal(invalidClock.payload.specimenNoteUpdatedAt, undefined);
});

test('clearable profile and diagnosis fields cross sync as explicit nulls', () => {
  const { sanitiseEntry } = require('./api/collection');
  const safe = sanitiseEntry({
    savedId: 'clearable',
    category: 'plant',
    nickname: null,
    room: null,
    disease: null,
  });

  assert.equal(safe.payload.nickname, null);
  assert.equal(safe.payload.room, null);
  assert.equal(safe.payload.disease, null);
});

test('invalid and future client clocks cannot freeze server LWW or watering', () => {
  const { sanitiseEntry } = require('./api/collection');
  const before = Date.now();
  const safe = sanitiseEntry({
    savedId: 'future', category: 'plant',
    savedAt: '2999-01-01T00:00:00.000Z',
    updatedAt: '2999-01-01T00:00:00.000Z',
    lastWateredAt: '2999-01-01T00:00:00.000Z',
    specimenNote: 'note', specimenNoteUpdatedAt: '2999-01-01T00:00:00.000Z',
  });
  const after = Date.now();
  for (const field of ['savedAt', 'updatedAt', 'lastWateredAt', 'specimenNoteUpdatedAt']) {
    const parsed = Date.parse(safe.payload[field]);
    assert.ok(parsed >= before && parsed <= after, `${field} must be capped to server time`);
  }
  assert.equal(safe.saved_at, safe.payload.savedAt);

  const invalid = sanitiseEntry({
    savedId: 'invalid', category: 'plant', savedAt: 'soon', updatedAt: 'never', lastWateredAt: 'later',
  });
  assert.equal(invalid.saved_at, null);
  assert.equal(invalid.payload.updatedAt, undefined);
  assert.equal(invalid.payload.lastWateredAt, undefined);
});

test('the endpoint preserves a newer remote note when an incoming watering edit wins', async () => {
  const old = '2026-08-18T10:00:00.000Z';
  const watering = '2026-08-20T12:00:00.000Z';
  const note = '2026-08-20T13:00:00.000Z';
  const admin = createCollectionAdmin({
    rows: [{
      saved_id: 'one', category: 'plant', saved_at: old, updated_at: old, deleted: false,
      payload: { specimenNote: 'remote note', specimenNoteUpdatedAt: note, updatedAt: old },
    }],
  });
  const result = responseHarness();
  await loadCollectionApi(admin)(
    {
      method: 'POST',
      body: {
        entries: [{
          savedId: 'one', category: 'plant', water: 'Medium',
          lastWateredAt: watering, updatedAt: watering, savedAt: old,
          specimenNote: 'stale note', specimenNoteUpdatedAt: old,
        }],
        deletedIds: [],
      },
    },
    result.response
  );
  assert.equal(result.statusCode, 200);
  assert.equal(admin.row('one').payload.specimenNote, 'remote note');
  assert.equal(admin.row('one').payload.lastWateredAt, watering);
  assert.ok(Date.parse(admin.row('one').payload.updatedAt) > Date.parse(note));
});

test('the endpoint preserves a newer incoming note when remote watering wins', async () => {
  const old = '2026-08-18T10:00:00.000Z';
  const note = '2026-08-20T12:00:00.000Z';
  const watering = '2026-08-20T13:00:00.000Z';
  const admin = createCollectionAdmin({
    rows: [{
      saved_id: 'one', category: 'plant', saved_at: old, updated_at: watering, deleted: false,
      payload: {
        water: 'Medium', lastWateredAt: watering, updatedAt: watering,
        specimenNote: 'stale note', specimenNoteUpdatedAt: old,
      },
    }],
  });
  const result = responseHarness();
  await loadCollectionApi(admin)(
    {
      method: 'POST',
      body: {
        entries: [{
          savedId: 'one', category: 'plant', updatedAt: note, savedAt: old,
          specimenNote: 'incoming note', specimenNoteUpdatedAt: note,
        }],
        deletedIds: [],
      },
    },
    result.response
  );
  assert.equal(result.statusCode, 200);
  assert.equal(admin.row('one').payload.specimenNote, 'incoming note');
  assert.equal(admin.row('one').payload.lastWateredAt, watering);
  assert.ok(Date.parse(admin.row('one').payload.updatedAt) > Date.parse(watering));
});

test('an older remote copy cannot undo a local edit', () => {
  const { mergeCollections } = require('./components/collectionMerge');
  const local = [{ savedId: 'one', room: 'Office', updatedAt: '2026-08-20T10:00:00.000Z' }];
  const remote = [{ savedId: 'one', room: 'Kitchen', updatedAt: '2026-08-18T10:00:00.000Z' }];
  const result = mergeCollections(local, remote, new Set());
  assert.equal(result.entries[0].room, 'Office');
  assert.equal(result.updated, 0);
});

test('sync reports remote additions, updates and deletions separately', () => {
  const { mergeCollections } = require('./components/collectionMerge');
  const local = [
    { savedId: 'update', nickname: 'old', updatedAt: '2026-08-18T10:00:00.000Z' },
    { savedId: 'delete', updatedAt: '2026-08-20T10:00:00.000Z' },
  ];
  const remote = [
    { savedId: 'update', nickname: 'new', updatedAt: '2026-08-20T10:00:00.000Z' },
    { savedId: 'add', savedAt: '2026-08-20T11:00:00.000Z' },
  ];
  const result = mergeCollections(local, remote, new Set(['delete']));
  assert.deepEqual({ added: result.added, updated: result.updated, removed: result.removed }, {
    added: 1, updated: 1, removed: 1,
  });
  assert.deepEqual(result.entries.map((e) => e.savedId), ['add', 'update']);
});

test('an edit completed during fetch survives the remote merge write', async () => {
  const old = '2026-08-18T10:00:00.000Z';
  const edited = '2026-08-20T15:00:00.000Z';
  let currentLocal = [{
    savedId: 'one', category: 'plant', specimenNote: 'old note',
    specimenNoteUpdatedAt: old, updatedAt: old, photoUri: 'file:///private.jpg',
  }];
  const harness = loadCollectionSync({
    local: () => currentLocal,
    replaceResult: (entries) => entries,
    responseData: {
      synced: true,
      entries: [
        { savedId: 'one', category: 'plant', specimenNote: 'old note', specimenNoteUpdatedAt: old, updatedAt: old },
        { savedId: 'remote-add', category: 'bird', savedAt: edited, updatedAt: edited },
      ],
      deletedIds: [],
    },
    beforeResponse: async () => {
      currentLocal = [{
        ...currentLocal[0], specimenNote: 'edited during fetch',
        specimenNoteUpdatedAt: edited, updatedAt: edited,
      }];
    },
  });

  const result = await harness.sync.syncCollection({ force: true });
  const stored = harness.replacedEntries();
  assert.equal(result.synced, true);
  assert.equal(harness.requestBody().entries[0].specimenNote, 'old note');
  assert.equal(stored.find((entry) => entry.savedId === 'one').specimenNote, 'edited during fetch');
  assert.equal(stored.find((entry) => entry.savedId === 'one').photoUri, 'file:///private.jpg');
  assert.ok(stored.some((entry) => entry.savedId === 'remote-add'));
});

test('a deletion made during fetch is not resurrected by the response', async () => {
  const at = '2026-08-20T15:00:00.000Z';
  let currentLocal = [
    { savedId: 'keep', category: 'plant', updatedAt: at },
    { savedId: 'gone', category: 'plant', updatedAt: at },
  ];
  const harness = loadCollectionSync({
    local: () => currentLocal,
    replaceResult: (entries) => entries,
    responseData: {
      synced: true,
      entries: [
        { savedId: 'gone', category: 'plant', updatedAt: at },
        { savedId: 'remote-add', category: 'bird', updatedAt: at },
      ],
      deletedIds: [],
    },
    beforeResponse: async ({ values }) => {
      currentLocal = currentLocal.filter((entry) => entry.savedId !== 'gone');
      values.set('@naturelens/pending_deletes', JSON.stringify(['gone']));
    },
  });

  const result = await harness.sync.syncCollection({ force: true });
  const stored = harness.replacedEntries();
  assert.equal(result.synced, true);
  assert.equal(stored.some((entry) => entry.savedId === 'gone'), false);
  assert.deepEqual(JSON.parse(harness.values.get('@naturelens/pending_deletes')), ['gone']);
});

test('a failed local merge write is not acknowledged as a successful sync', async () => {
  const local = [{ savedId: 'one', category: 'plant', updatedAt: '2026-08-18T10:00:00.000Z' }];
  const remote = [{ savedId: 'one', category: 'plant', updatedAt: '2026-08-20T10:00:00.000Z' }];
  const harness = loadCollectionSync({
    local,
    pending: ['still-pending'],
    replaceResult: null,
    responseData: { synced: true, entries: remote, deletedIds: ['still-pending'] },
  });

  const result = await harness.sync.syncCollection({ force: true });
  assert.deepEqual(result, { synced: false, added: 0, updated: 0, removed: 0, changed: false });
  assert.deepEqual(JSON.parse(harness.values.get('@naturelens/pending_deletes')), ['still-pending']);
  assert.equal(harness.values.has('@naturelens/last_sync'), false);
});

test('sync clears only tombstones explicitly confirmed by the server', async () => {
  const harness = loadCollectionSync({
    pending: ['confirmed', 'unconfirmed'],
    responseData: { synced: true, entries: [], deletedIds: ['confirmed', 'remote-only'] },
    beforeResponse: async ({ values }) => {
      // Uma exclusao criada enquanto o request estava em voo nao pertence ao
      // lote enviado e nao pode sumir quando a resposta antiga chegar.
      values.set(
        '@naturelens/pending_deletes',
        JSON.stringify(['confirmed', 'unconfirmed', 'during-flight'])
      );
    },
  });

  const result = await harness.sync.syncCollection({ force: true });
  assert.equal(result.synced, true);
  assert.deepEqual(harness.requestBody().deletedIds, ['confirmed', 'unconfirmed']);
  assert.deepEqual(
    JSON.parse(harness.values.get('@naturelens/pending_deletes')),
    ['unconfirmed', 'during-flight']
  );
  assert.equal(harness.values.has('@naturelens/last_sync'), true);
});

test('the server does not overwrite a newer remote edit before pull', () => {
  const api = read('api/collection.js');
  const readBeforeWrite = api.indexOf(".select('saved_id, category, payload, saved_at, updated_at, deleted')");
  const upsert = api.indexOf(".from('collection_entries').upsert");
  assert.ok(readBeforeWrite >= 0 && readBeforeWrite < upsert, 'server must inspect remote timestamps before upsert');
  assert.match(api, /entryTimestamp/, 'server must compare edit timestamps');
  assert.match(api, /\.eq\('updated_at', current\.updated_at\)/, 'updates need an atomic compare-and-swap token');
  assert.match(api, /ignoreDuplicates:\s*true/, 'a concurrent insert must not overwrite the row that won');
});

test('a failed tombstone write can never return synced true', async () => {
  const admin = createCollectionAdmin({ failTombstones: true });
  const handler = loadCollectionApi(admin);
  const result = responseHarness();
  const originalError = console.error;
  console.error = () => {};
  try {
    await handler(
      { method: 'POST', body: { deviceId: 'device-test', entries: [], deletedIds: ['gone'] } },
      result.response
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.reason, 'syncFailed');
  assert.notEqual(result.body.synced, true);
  assert.equal(
    admin.calls.some((call) => call.operation === 'select' && call.filters.some((f) => f.field === 'deleted' && f.value === false)),
    false,
    'the handler must stop before pull/success after a tombstone failure'
  );
});

test('tombstones do not consume active-result pages', async () => {
  const at = '2026-08-20T12:00:00.000Z';
  const rows = [];
  for (let i = 0; i < 501; i += 1) {
    rows.push({
      saved_id: `dead-${String(i).padStart(4, '0')}`,
      category: 'deleted', payload: {}, saved_at: at, updated_at: at, deleted: true,
    });
    rows.push({
      saved_id: `live-${String(i).padStart(4, '0')}`,
      category: 'plant', payload: { name: `Plant ${i}`, updatedAt: at },
      saved_at: at, updated_at: at, deleted: false,
    });
  }
  const admin = createCollectionAdmin({ rows });
  const handler = loadCollectionApi(admin);
  const result = responseHarness();
  await handler(
    { method: 'POST', body: { deviceId: 'device-test', entries: [], deletedIds: [] } },
    result.response
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.synced, true);
  assert.equal(result.body.entries.length, 501, 'the second active page must not disappear');
  assert.ok(result.body.entries.every((entry) => entry.category === 'plant'));
  const activeReads = admin.calls.filter(
    (call) => call.operation === 'select' && call.filters.some((f) => f.field === 'deleted' && f.value === false)
  );
  assert.equal(activeReads.length, 2, '501 active rows require two keyset pages');
});

test('preflight finds the exact version beyond any tombstone window', async () => {
  const old = '2026-08-18T10:00:00.000Z';
  const newer = '2026-08-20T10:00:00.000Z';
  const rows = Array.from({ length: 501 }, (_, i) => ({
    saved_id: `dead-${String(i).padStart(4, '0')}`,
    category: 'deleted', payload: {}, saved_at: old, updated_at: old, deleted: true,
  }));
  rows.push({
    saved_id: 'target', category: 'plant',
    payload: { nickname: 'remote-old', updatedAt: old },
    saved_at: old, updated_at: old, deleted: false,
  });
  const admin = createCollectionAdmin({ rows });
  const handler = loadCollectionApi(admin);
  const result = responseHarness();
  await handler(
    {
      method: 'POST',
      body: {
        deviceId: 'device-test',
        deletedIds: [],
        entries: [{ savedId: 'target', category: 'plant', nickname: 'client-new', updatedAt: newer, savedAt: old }],
      },
    },
    result.response
  );

  assert.equal(result.statusCode, 200);
  assert.equal(admin.row('target').payload.nickname, 'client-new');
  assert.ok(
    admin.calls.some(
      (call) => call.operation === 'select'
        && call.filters.some((f) => f.kind === 'in' && f.field === 'saved_id' && f.values.includes('target'))
    ),
    'preflight must query the incoming savedId, not an arbitrary first page'
  );
});

test('CAS keeps a concurrent newer edit instead of overwriting it', async () => {
  const old = '2026-08-18T10:00:00.000Z';
  const incoming = '2026-08-20T10:00:00.000Z';
  const concurrent = '2026-08-21T10:00:00.000Z';
  const admin = createCollectionAdmin({
    rows: [{
      saved_id: 'race', category: 'plant',
      payload: { nickname: 'old', updatedAt: old },
      saved_at: old, updated_at: old, deleted: false,
    }],
    beforeCasUpdate: ({ state, keyFor, clone }) => {
      const key = keyFor({ email: 'owner@example.test', saved_id: 'race' });
      const row = state.get(key);
      state.set(key, clone({
        ...row,
        payload: { ...row.payload, nickname: 'concurrent-wins', updatedAt: concurrent },
        updated_at: concurrent,
      }));
    },
  });
  const handler = loadCollectionApi(admin);
  const result = responseHarness();
  await handler(
    {
      method: 'POST',
      body: {
        deviceId: 'device-test',
        deletedIds: [],
        entries: [{ savedId: 'race', category: 'plant', nickname: 'incoming', updatedAt: incoming, savedAt: old }],
      },
    },
    result.response
  );

  assert.equal(result.statusCode, 200);
  assert.equal(admin.row('race').payload.nickname, 'concurrent-wins');
  assert.equal(result.body.entries.find((entry) => entry.savedId === 'race').nickname, 'concurrent-wins');
  const cas = admin.calls.find((call) => call.operation === 'update');
  assert.equal(cas.count, 0, 'the stale compare-and-swap must update zero rows');
  assert.ok(cas.filters.some((f) => f.field === 'updated_at' && f.value === old));
  assert.ok(cas.filters.some((f) => f.field === 'deleted' && f.value === false));
});

test('deletions travel as tombstones', () => {
  // Without them, deleting a find here and syncing pulls it straight back from
  // another device, and the app appears to refuse deletions.
  const api = read('api/collection.js');
  assert.match(api, /deleted: true/);
  assert.match(api, /deletedIds: \(finalRelevant \|\| \[\]\)\.filter/);

  const client = read('components/collectionSync.js');
  assert.match(client, /export async function rememberDeletion/);
  const { mergeCollections } = require('./components/collectionMerge');
  const merge = mergeCollections(
    [{ savedId: 'gone', photoUri: 'file:///keep-private.jpg' }],
    [{ savedId: 'gone' }],
    new Set(['gone'])
  );
  assert.deepEqual(merge.entries, [], 'a find deleted elsewhere must not be re-added');
  assert.equal(merge.removed, 1);

  // And removeFromCollection has to actually record one.
  const storage = read('components/storage.js');
  assert.match(storage, /rememberDeletion\(savedId\)/);
});

test('sync never throws and never blocks the screen', () => {
  const client = read('components/collectionSync.js');
  // One catch-all: the local collection already works, sync is a convenience.
  assert.match(client, /catch \(e\) \{[\s\S]{0,250}return \{ synced: false, added: 0, updated: 0/);

  const screen = read('screens/CollectionScreen.js');
  // The local list must render first, then sync. Awaiting sync before setting
  // state would make an offline user stare at a spinner.
  // Slice from `load` to the NEXT useFocusEffect - the name also appears in the
  // import line at the top, and searching from zero produced a backwards slice.
  const loadStart = screen.indexOf('const load = useCallback');
  const load = screen.slice(loadStart, screen.indexOf('useFocusEffect', loadStart));
  assert.ok(
    load.indexOf('setCollection(list)') < load.indexOf('syncCollection('),
    'the local collection must be on screen before sync runs'
  );
  assert.doesNotMatch(load, /await syncCollection/, 'sync must not be awaited during load');
  assert.match(
    load,
    /result\?\.changed[\s\S]*getCollection\(\)[\s\S]*setCollection\(merged\)/,
    'remote metadata changes must refresh the visible collection'
  );
});

test('a failed write is never reported as a successful backup', () => {
  // supabase-js reports failure through `error`, not by throwing. Telling
  // someone their collection was backed up when it was not is the worst possible
  // lie for a feature whose entire purpose is not losing things.
  const api = read('api/collection.js');
  assert.match(api, /console\.error\('collection: upsert failed'/);
  assert.match(api, /reason: 'syncFailed'/);
});

test('replaceCollection is only reachable from sync', () => {
  // It is the one function that can lose finds. Everything else appends or
  // filters.
  const users = fs
    .readdirSync(path.join(__dirname, 'screens'))
    .filter((f) => f.endsWith('.js'))
    .filter((f) => /replaceCollection/.test(read(path.join('screens', f))));
  assert.deepEqual(users, [], `replaceCollection must not be called from a screen: ${users.join(', ')}`);
});

test('the sync endpoint is rate limited and needs a device', () => {
  const api = read('api/collection.js');
  assert.match(api, /scope: 'collection-sync'/);
  assert.match(api, /requireDeviceId\(req, res\)/);
  assert.match(api, /MAX_ENTRIES = 500/);
});

test('an oversized entry rejects the whole batch before any upsert', async () => {
  const admin = createCollectionAdmin();
  const handler = loadCollectionApi(admin);
  const result = responseHarness();
  const oversized = {
    savedId: 'too-large',
    category: 'plant',
    overview: 'x'.repeat(2000),
    overviewOriginal: 'x'.repeat(2000),
    commonNames: 'x'.repeat(2000),
    synonyms: 'x'.repeat(2000),
    toxicity: 'x'.repeat(2000),
    commonUses: 'x'.repeat(2000),
    culturalSignificance: 'x'.repeat(2000),
  };
  await handler(
    {
      method: 'POST',
      body: {
        entries: [{ savedId: 'valid', category: 'plant', name: 'kept' }, oversized],
        deletedIds: [],
      },
    },
    result.response
  );

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.reason, 'invalidEntry');
  assert.notEqual(result.body.synced, true);
  assert.equal(
    admin.calls.some((call) => call.operation === 'upsert'),
    false,
    'invalid batches must not write a valid prefix or tombstones'
  );
  assert.equal(admin.row('valid'), undefined);
  assert.equal(admin.row('too-large'), undefined);
});
