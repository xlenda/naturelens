const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

function loadStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  const asyncStorage = {
    async getItem(key) {
      await Promise.resolve();
      return values.has(key) ? values.get(key) : null;
    },
    async setItem(key, value) {
      await Promise.resolve();
      values.set(key, value);
    },
    async removeItem(key) {
      await Promise.resolve();
      values.delete(key);
    },
  };
  const file = path.join(__dirname, 'components/observationStorage.js');
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const fakeRequire = (name) => name === '@react-native-async-storage/async-storage'
    ? asyncStorage
    : require(name);
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return { storage: mod.exports, values };
}

function definitions() {
  return [
    { key: 'context', type: 'enum', options: ['garden', 'forest'], required: true },
    { key: 'placeNote', type: 'text', maxLength: 80 },
    { key: 'baselineNote', type: 'text', maxLength: 280 },
  ];
}

function validProfile(context = 'garden') {
  return {
    schemaVersion: 1,
    definitions: definitions(),
    fields: { context, placeNote: 'Quintal norte', baselineNote: 'Primeiro registro' },
  };
}

function exactEntity(category, canonicalName) {
  return {
    category,
    identityV1: {
      schemaVersion: 1,
      category,
      status: 'exact',
      taxon: { canonicalName },
      provider: { name: 'nature-provider', id: '42' },
    },
  };
}

test('chave local isola categoria e exige identidade exata quando nao esta salvo', () => {
  const { storage } = loadStorage();
  assert.deepEqual(storage.OBSERVATION_CATEGORIES, [
    'plant', 'tree', 'insect', 'mushroom', 'fish', 'bird', 'sound',
  ]);
  assert.equal(
    storage.observationSubjectKey(exactEntity('plant', 'Monstera deliciosa')),
    'observation:plant:taxon:monstera%20deliciosa',
  );
  assert.equal(
    storage.observationSubjectKey(exactEntity('tree', 'Monstera deliciosa')),
    'observation:tree:taxon:monstera%20deliciosa',
  );
  assert.equal(storage.observationSubjectKey({
    category: 'insect',
    identityV1: { status: 'candidate', taxon: { canonicalName: 'Danaus plexippus' } },
  }), '');
  assert.equal(storage.observationSubjectKey({ category: 'crop', savedId: 'crop-1' }), '');
  assert.equal(storage.observationSubjectKey({ category: 'fish', savedId: 'fish-1' }), 'observation:fish:saved:fish-1');
  assert.equal(storage.observationSubjectKey({
    category: 'fish',
    identityV1: {
      schemaVersion: 1,
      category: 'fish',
      status: 'exact',
      taxon: {},
      provider: { name: 'Perch', id: 42 },
      provenance: { providerId: 'results[].id' },
    },
  }), 'observation:fish:provider:perch:42');
});

test('resultado sem taxon exato usa fornecedor somente com proveniencia explicita', () => {
  const { storage } = loadStorage();
  const unresolved = {
    category: 'bird',
    identityV1: {
      schemaVersion: 1,
      category: 'bird',
      status: 'unresolved',
      taxon: { canonicalName: null },
      provider: { name: 'Nyckel', id: 'scarlet-macaw' },
      provenance: { providerId: 'predictions[].label' },
    },
  };
  assert.equal(
    storage.observationSubjectKey(unresolved),
    'observation:bird:provider:nyckel:scarlet-macaw',
  );
  assert.equal(storage.observationSubjectKey({
    ...unresolved,
    identityV1: { ...unresolved.identityV1, provenance: {} },
  }), '');
  assert.equal(storage.observationSubjectKey({
    ...unresolved,
    identityV1: { ...unresolved.identityV1, provider: { name: 'Nyckel', id: null } },
  }), '');
  assert.equal(storage.observationSubjectKey({
    ...unresolved,
    identityV1: { ...unresolved.identityV1, category: 'sound' },
  }), '');
});

test('perfil persiste apenas enums e textos declarados pelo chamador', async () => {
  const { storage } = loadStorage();
  const key = storage.observationSubjectKey(exactEntity('plant', 'Monstera deliciosa'));
  const profile = await storage.saveObservationProfile(key, 'plant', {
    ...validProfile(),
    fields: {
      context: 'garden',
      placeNote: `  ${'a'.repeat(100)}  `,
      baselineNote: ' Folha nova   observada ',
    },
  });
  assert.ok(profile.profileId);
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.category, 'plant');
  assert.equal(profile.fields.placeNote.length, 80);
  assert.equal(profile.fields.baselineNote, 'Folha nova observada');
  assert.equal((await storage.getObservationProfile(key)).profileId, profile.profileId);

  assert.equal(await storage.saveObservationProfile(key, 'plant', {
    ...validProfile('field'), fields: { context: 'field' },
  }), null);
  assert.equal(await storage.saveObservationProfile(key, 'plant', {
    ...validProfile(), fields: { context: 'garden', advice: 'inventado' },
  }), null);
  assert.equal(await storage.saveObservationProfile(key, 'fish', validProfile()), null);
  assert.equal(await storage.saveObservationProfile(key, 'plant', {
    schemaVersion: 1,
    definitions: [{ key: 'context', type: 'number', required: true }],
    fields: { context: 3 },
  }), null);
});

test('categorias permanecem isoladas mesmo com o mesmo taxon', async () => {
  const { storage } = loadStorage();
  const plantKey = storage.observationSubjectKey(exactEntity('plant', 'Example species'));
  const treeKey = storage.observationSubjectKey(exactEntity('tree', 'Example species'));
  const plant = await storage.saveObservationProfile(plantKey, 'plant', validProfile());
  const tree = await storage.saveObservationProfile(treeKey, 'tree', validProfile('forest'));
  assert.ok(plant.profileId !== tree.profileId);
  assert.equal((await storage.getObservationProfile(plantKey)).category, 'plant');
  assert.equal((await storage.getObservationProfile(treeKey)).category, 'tree');
  assert.equal(await storage.appendObservationEvent(plant.profileId, 'tree', {
    type: 'observation', note: 'Categoria errada',
  }), null);
});

test('evento aceita somente tipo e unidade da categoria com valores limitados', async () => {
  const { storage } = loadStorage();
  const key = storage.observationSubjectKey(exactEntity('fish', 'Poecilia reticulata'));
  const profile = await storage.saveObservationProfile(key, 'fish', validProfile());
  const occurredAt = '2026-08-20T15:30:00-03:00';
  const event = await storage.appendObservationEvent(profile.profileId, 'fish', {
    type: 'waterReading', note: 'Leitura observada', count: 2, measure: 25.4, unit: 'celsius', occurredAt,
  });
  assert.ok(event.eventId);
  assert.equal(event.occurredAt, '2026-08-20T18:30:00.000Z');
  assert.equal(event.measure, 25.4);
  assert.equal(event.unit, 'celsius');

  assert.equal(await storage.appendObservationEvent(profile.profileId, 'fish', {
    type: 'flowering', note: 'Tipo de planta',
  }), null);
  assert.equal(await storage.appendObservationEvent(profile.profileId, 'fish', {
    type: 'waterReading', measure: 7, unit: 'decibel',
  }), null);
  assert.equal(await storage.appendObservationEvent(profile.profileId, 'fish', {
    type: 'observation', unit: 'cm', note: 'Unidade sem medida',
  }), null);
  assert.equal(await storage.appendObservationEvent(profile.profileId, 'fish', {
    type: 'count', count: 1.5,
  }), null);
  assert.equal(await storage.appendObservationEvent(profile.profileId, 'fish', {
    type: 'observation',
  }), null);
  assert.equal(await storage.appendObservationEvent(profile.profileId, 'fish', {
    type: 'observation', note: 'Data invalida', occurredAt: 'amanha',
  }), null);
});

test('escritas concorrentes sao serializadas e o diario permanece append-only', async () => {
  const { storage } = loadStorage();
  const key = storage.observationSubjectKey(exactEntity('insect', 'Danaus plexippus'));
  const profile = await storage.saveObservationProfile(key, 'insect', validProfile('forest'));
  const created = await Promise.all(Array.from({ length: 24 }, (_, index) => (
    storage.appendObservationEvent(profile.profileId, 'insect', {
      type: 'count', count: index, note: `Amostra ${index}`,
    })
  )));
  assert.equal(created.filter(Boolean).length, 24);
  assert.equal(new Set(created.map((event) => event.eventId)).size, 24);
  const stored = await storage.getObservationEvents(profile.profileId);
  assert.equal(stored.length, 24);
  assert.deepEqual(new Set(stored.map((event) => event.note)), new Set(created.map((event) => event.note)));
});

test('mover entre chave temporaria e salva preserva perfil e eventos nos dois sentidos', async () => {
  const { storage } = loadStorage();
  const entity = exactEntity('bird', 'Turdus rufiventris');
  const taxonKey = storage.observationSubjectKey(entity);
  const savedKey = storage.observationSubjectKey(entity, 'bird-uuid');
  const profile = await storage.saveObservationProfile(taxonKey, 'bird', validProfile('forest'));
  await storage.appendObservationEvent(profile.profileId, 'bird', {
    type: 'vocalization', note: 'Canto observado', measure: 3, unit: 'second',
  });

  const saved = await storage.moveObservationSubject(taxonKey, savedKey);
  assert.equal(saved.profileId, profile.profileId);
  assert.equal(await storage.getObservationProfile(taxonKey), null);
  assert.equal((await storage.getObservationEvents(profile.profileId)).length, 1);

  const restored = await storage.moveObservationSubject(savedKey, taxonKey);
  assert.equal(restored.profileId, profile.profileId);
  assert.equal(await storage.getObservationProfile(savedKey), null);
  assert.equal((await storage.getObservationEvents(profile.profileId)).length, 1);
});

test('mover entre fornecedor e savedId preserva diario de resultado nao exato', async () => {
  const { storage } = loadStorage();
  const entity = {
    category: 'sound',
    identityV1: {
      schemaVersion: 1,
      category: 'sound',
      status: 'unresolved',
      taxon: { canonicalName: null },
      provider: { name: 'Nyckel', id: 'sound-label-17' },
      provenance: { providerId: 'predictions[].label' },
    },
  };
  const providerKey = storage.observationSubjectKey(entity);
  const savedKey = storage.observationSubjectKey(entity, 'sound-uuid');
  const profile = await storage.saveObservationProfile(providerKey, 'sound', validProfile('forest'));
  await storage.appendObservationEvent(profile.profileId, 'sound', {
    type: 'recording', note: 'Primeira comparacao', measure: 4, unit: 'second',
  });

  const saved = await storage.moveObservationSubject(providerKey, savedKey);
  assert.equal(saved.profileId, profile.profileId);
  const restored = await storage.moveObservationSubject(savedKey, providerKey);
  assert.equal(restored.profileId, profile.profileId);
  assert.equal((await storage.getObservationEvents(profile.profileId)).length, 1);
});

test('colisao de migracao une diarios sem duplicar perfil nem perder eventos', async () => {
  const { storage, values } = loadStorage();
  const entity = exactEntity('mushroom', 'Amanita muscaria');
  const taxonKey = storage.observationSubjectKey(entity);
  const savedKey = storage.observationSubjectKey(entity, 'fungus-uuid');
  const target = await storage.saveObservationProfile(savedKey, 'mushroom', validProfile('forest'));
  const source = await storage.saveObservationProfile(taxonKey, 'mushroom', validProfile('garden'));
  await storage.appendObservationEvent(target.profileId, 'mushroom', {
    type: 'observation', note: 'Registro salvo',
  });
  await storage.appendObservationEvent(source.profileId, 'mushroom', {
    type: 'substrate', note: 'Substrato observado',
  });

  const merged = await storage.moveObservationSubject(taxonKey, savedKey);
  assert.equal(merged.profileId, target.profileId);
  assert.equal(await storage.getObservationProfile(taxonKey), null);
  assert.equal((await storage.getObservationEvents(target.profileId)).length, 2);
  assert.deepEqual(await storage.getObservationEvents(source.profileId), []);
  const raw = JSON.parse(values.get(storage.OBSERVATION_DATA_KEY));
  assert.equal(raw.profiles.length, 1);
});

test('clear remove perfis e diario e clearCollection inclui essa limpeza', async () => {
  const { storage, values } = loadStorage();
  const key = storage.observationSubjectKey(exactEntity('sound', 'Gryllus example'));
  const profile = await storage.saveObservationProfile(key, 'sound', validProfile('forest'));
  await storage.appendObservationEvent(profile.profileId, 'sound', {
    type: 'recording', note: 'Som curto', measure: 3, unit: 'second',
  });
  assert.equal(values.has(storage.OBSERVATION_DATA_KEY), true);
  assert.equal(await storage.clearObservationData(), true);
  assert.equal(values.has(storage.OBSERVATION_DATA_KEY), false);
  assert.equal(await storage.getObservationProfile(key), null);
  assert.deepEqual(await storage.getObservationEvents(profile.profileId), []);

  const collectionStorage = fs.readFileSync(path.join(__dirname, 'components/storage.js'), 'utf8');
  assert.match(collectionStorage, /const \{ clearObservationData \} = require\('\.\/observationStorage'\)/);
  assert.match(collectionStorage, /await clearObservationData\(\)/);
});

test('dados locais corrompidos falham fechados', async () => {
  const first = loadStorage({ '@naturelens_observation_data_v1': '{quebrado' });
  assert.equal(await first.storage.getObservationProfile('observation:plant:saved:x'), null);
  assert.deepEqual(await first.storage.getObservationEvents('x'), []);

  const second = loadStorage({
    '@naturelens_observation_data_v1': JSON.stringify({
      schemaVersion: 1,
      profiles: [{ profileId: 'x', category: 'crop', subjectKey: 'observation:crop:saved:x' }],
      events: [{ eventId: 'e', profileId: 'x', category: 'crop', type: 'advice' }],
    }),
  });
  assert.equal(await second.storage.getObservationProfile('observation:plant:saved:x'), null);
  assert.deepEqual(await second.storage.getObservationEvents('x'), []);
});
