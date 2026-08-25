const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

function loadStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  const asyncStorage = {
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
  const file = path.join(__dirname, 'components/agronomyStorage.js');
  const helperFile = path.join(__dirname, 'components/agronomyProfileV2.js');
  const { code: helperCode } = babel.transformFileSync(helperFile, { presets: ['babel-preset-expo'] });
  const helperModule = { exports: {} };
  new Function('module', 'exports', 'require', helperCode)(helperModule, helperModule.exports, require);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const fakeRequire = (name) => {
    if (name === '@react-native-async-storage/async-storage') return asyncStorage;
    if (name === './agronomyProfileV2') return helperModule.exports;
    return require(name);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return { storage: mod.exports, values };
}

function validDraft() {
  return {
    schemaVersion: 2,
    purpose: 'grain',
    system: 'rainfed',
    location: { countryCode: 'BR', admin1Code: 'BR-SP', locality: 'Campinas' },
    planting: { date: '2026-08-20', stage: 'V4', stageConfirmed: true },
    soil: { description: 'Argiloso', hasReport: true },
  };
}

function legacyDraft() {
  return {
    schemaVersion: 1,
    purpose: 'grain',
    system: 'rainfed',
    location: { municipality: 'Campinas', state: 'SP' },
    planting: { date: '2026-08-20', stage: 'V4', stageConfirmed: true },
    soil: { description: 'Argiloso', hasReport: true },
  };
}

test('perfil agronomico usa o exemplar e nunca inventa identidade exata', () => {
  const { storage } = loadStorage();
  assert.equal(storage.agronomySubjectKey({ savedId: 'abc' }), 'saved:abc');
  assert.equal(storage.agronomySubjectKey({
    identityV1: { status: 'exact', taxon: { canonicalName: 'Zea mays' } },
  }), 'taxon:zea mays');
  assert.equal(storage.agronomySubjectKey({
    id: 'maybe-maize',
    identityV1: { status: 'candidate', provider: { name: 'crop-health', id: '42' } },
  }), 'provider:crop-health:42');
  assert.equal(storage.agronomySubjectKey({ category: 'crop', id: 'maize' }), 'catalog:maize');
});

test('perfil persiste apenas contexto V2 mundial completo de lavoura', async () => {
  const { storage } = loadStorage();
  const entity = { category: 'crop', name: 'Milho', scientific: 'Zea mays' };
  assert.equal(await storage.saveAgronomyProfile({
    subjectKey: 'taxon:zea mays', entity, draft: { ...validDraft(), schemaVersion: 3 },
  }), null);

  const profile = await storage.saveAgronomyProfile({
    subjectKey: 'taxon:zea mays', entity, draft: validDraft(),
  });
  assert.ok(profile.profileId);
  assert.equal(profile.schemaVersion, 2);
  assert.deepEqual(profile.location, {
    countryCode: 'BR', admin1Code: 'BR-SP', locality: 'Campinas',
  });
  assert.equal((await storage.getAgronomyProfile('taxon:zea mays')).profileId, profile.profileId);

  const edited = await storage.saveAgronomyProfile({
    subjectKey: 'taxon:zea mays', entity,
    draft: { ...validDraft(), planting: { ...validDraft().planting, stage: 'V6' } },
  });
  assert.equal(edited.profileId, profile.profileId);
  assert.equal(edited.planting.stage, 'V6');
});

test('perfil V1 brasileiro migra para V2 sem perder identidade nem metadados', async () => {
  const legacy = {
    profileId: 'profile-v1',
    subjectKey: 'taxon:zea mays',
    category: 'crop',
    entityName: 'Milho',
    scientific: 'Zea mays',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...legacyDraft(),
  };
  const { storage } = loadStorage({
    '@naturelens_agronomy_profiles_v1': JSON.stringify([legacy]),
  });

  const migrated = await storage.getAgronomyProfile('taxon:zea mays');
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.profileId, 'profile-v1');
  assert.equal(migrated.createdAt, legacy.createdAt);
  assert.deepEqual(migrated.location, {
    countryCode: 'BR', admin1Code: 'BR-SP', locality: 'Campinas',
  });

  const resaved = await storage.saveAgronomyProfile({
    subjectKey: 'taxon:zea mays',
    entity: { category: 'crop', name: 'Milho', scientific: 'Zea mays' },
    draft: legacyDraft(),
  });
  assert.equal(resaved.profileId, 'profile-v1');
  assert.equal(resaved.schemaVersion, 2);
});

test('perfil estrangeiro permanece estrangeiro e subdivisao incoerente falha fechada', async () => {
  const { storage } = loadStorage();
  const entity = { category: 'crop', name: 'Wheat', scientific: 'Triticum aestivum' };
  const german = await storage.saveAgronomyProfile({
    subjectKey: 'taxon:triticum aestivum',
    entity,
    draft: {
      ...validDraft(),
      location: { countryCode: 'DE', admin1Code: 'DE-BY', locality: 'Freising' },
    },
  });
  assert.deepEqual(german.location, {
    countryCode: 'DE', admin1Code: 'DE-BY', locality: 'Freising',
  });
  assert.equal(await storage.saveAgronomyProfile({
    subjectKey: 'taxon:triticum aestivum',
    entity,
    draft: {
      ...validDraft(),
      location: { countryCode: 'DE', admin1Code: 'BR-MG', locality: 'Freising' },
    },
  }), null);
});

test('diario agronomico e append-only e rejeita evento sem perfil', async () => {
  const { storage } = loadStorage();
  assert.equal(await storage.appendAgronomyEvent('missing', { type: 'rain', amount: 12, unit: 'mm' }), null);

  const profile = await storage.saveAgronomyProfile({
    subjectKey: 'taxon:glycine max',
    entity: { category: 'crop', name: 'Soja', scientific: 'Glycine max' },
    draft: validDraft(),
  });
  const first = await storage.appendAgronomyEvent(profile.profileId, {
    type: 'pestSample', amount: 2, unit: 'm', note: 'Seis pontos amostrados', stage: 'R2',
  });
  const second = await storage.appendAgronomyEvent(profile.profileId, {
    type: 'observation', note: 'Nova foto de acompanhamento',
  });
  assert.ok(first.eventId && second.eventId && first.eventId !== second.eventId);
  const events = await storage.getAgronomyEvents(profile.profileId);
  assert.equal(events.length, 2);
  assert.deepEqual(new Set(events.map((event) => event.type)), new Set(['pestSample', 'observation']));
});

test('salvar a cultura migra o perfil sem perder a identidade do diario', async () => {
  const { storage } = loadStorage();
  const profile = await storage.saveAgronomyProfile({
    subjectKey: 'catalog:maize',
    entity: { category: 'crop', id: 'maize', name: 'Milho', scientific: 'Zea mays' },
    draft: validDraft(),
  });
  await storage.appendAgronomyEvent(profile.profileId, { type: 'stage', note: 'V4 confirmado' });
  const moved = await storage.moveAgronomyProfileSubject('catalog:maize', 'saved:uuid-1');
  assert.equal(moved.profileId, profile.profileId);
  assert.equal(await storage.getAgronomyProfile('catalog:maize'), null);
  assert.equal((await storage.getAgronomyProfile('saved:uuid-1')).profileId, profile.profileId);
  assert.equal((await storage.getAgronomyEvents(profile.profileId)).length, 1);
});

test('limpeza local remove perfil e diario agronomico juntos', async () => {
  const { storage } = loadStorage();
  const profile = await storage.saveAgronomyProfile({
    subjectKey: 'taxon:zea mays',
    entity: { category: 'crop', name: 'Milho', scientific: 'Zea mays' },
    draft: validDraft(),
  });
  await storage.appendAgronomyEvent(profile.profileId, { type: 'observation', note: 'Talhao norte' });
  assert.equal(await storage.clearAgronomyData(), true);
  assert.equal(await storage.getAgronomyProfile('taxon:zea mays'), null);
  assert.deepEqual(await storage.getAgronomyEvents(profile.profileId), []);
});

test('migracao para chave existente une os dois diarios sem duplicar perfil', async () => {
  const { storage } = loadStorage();
  const entity = { category: 'crop', name: 'Milho', scientific: 'Zea mays' };
  const target = await storage.saveAgronomyProfile({
    subjectKey: 'saved:uuid-2', entity, draft: validDraft(),
  });
  const source = await storage.saveAgronomyProfile({
    subjectKey: 'taxon:zea mays', entity, draft: validDraft(),
  });
  await storage.appendAgronomyEvent(target.profileId, { type: 'rain', amount: 8, unit: 'mm' });
  await storage.appendAgronomyEvent(source.profileId, { type: 'observation', note: 'Folhas novas' });

  const merged = await storage.moveAgronomyProfileSubject('taxon:zea mays', 'saved:uuid-2');
  assert.equal(merged.profileId, target.profileId);
  assert.equal(await storage.getAgronomyProfile('taxon:zea mays'), null);
  assert.equal((await storage.getAgronomyProfiles()).length, 1);
  assert.equal((await storage.getAgronomyEvents(target.profileId)).length, 2);
});
