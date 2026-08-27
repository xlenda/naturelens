// Guarda a identidade do exemplar salvo. O id do classificador identifica a
// especie, nao o individuo fotografado: duas fotos da mesma especie precisam
// continuar sendo dois itens independentes na colecao.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const { CommonActions, StackActions, StackRouter } = require('@react-navigation/routers');

const DETAIL_SCREENS = [
  'PlantDetailScreen.js',
  'TreeDetailScreen.js',
  'MushroomDetailScreen.js',
  'InsectDetailScreen.js',
  'FishDetailScreen.js',
  'BirdDetailScreen.js',
  'CropDetailScreen.js',
  'SoundDetailScreen.js',
];

const COLLECTION_DETAIL_ROUTES = DETAIL_SCREENS.map((name) => name.replace('Screen.js', ''));

const readScreen = (name) => fs.readFileSync(path.join(__dirname, 'screens', name), 'utf8');

function loadStorage(initial, { failWrites = false } = {}) {
  let value = JSON.stringify(initial);
  const asyncStorage = {
    getItem: async () => value,
    setItem: async (_key, next) => {
      if (failWrites) throw new Error('disk full');
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
    if (name === '@react-native-async-storage/async-storage') return asyncStorage;
    if (name === 'expo-crypto') return { randomUUID: require('node:crypto').randomUUID };
    if (name === './collectionSync') return { rememberDeletion: async () => {} };
    if (name === './localReminders') return { isNativeReminderAvailable: () => false };
    if (name === './watering') return { getWateringStatus: (entry) => (entry?.water ? {} : null) };
    if (name === './persistentCollectionPhoto') return { deletePersistentCollectionPhoto: async () => {} };
    if (name === './collectionEntrySchema') return { normaliseCollectionEntry: (entry) => entry };
    return require(name);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return {
    storage: mod.exports,
    read: () => (value ? JSON.parse(value) : []),
  };
}

test('os oito detalhes reconhecem somente o savedId exato da rota', () => {
  for (const name of DETAIL_SCREENS) {
    const source = readScreen(name);
    assert.match(source, /const \[saved, setSaved\] = useState\(Boolean\(plant\.savedId\)\)/, name);
    assert.match(source, /const \[savedEntryId, setSavedEntryId\] = useState\(plant\.savedId \|\| null\)/, name);
    assert.match(source, /if \(!plant\.savedId\) return;/, name);
    assert.match(source, /list\.find\(\(p\) => p\.savedId === plant\.savedId\)/, name);
    assert.match(source, /else \{\s*setSaved\(false\);\s*setSavedEntryId\(null\)/, name);
    assert.doesNotMatch(source, /p\.id === plant\.id/, name);
    assert.match(source, /savedId=\{savedEntryId\}/, name);
  }
});

test('regar persiste um unico exemplar antes de devolver o novo horario', async () => {
  const wateredAt = '2026-08-20T12:00:00.000Z';
  const { storage, read } = loadStorage([
    { savedId: 'samambaia-a', category: 'plant', water: 'Medium', lastWateredAt: null },
    { savedId: 'samambaia-b', category: 'plant', water: 'Medium', lastWateredAt: null },
  ]);

  const result = await storage.markCollectionWatered('samambaia-a', wateredAt);

  assert.equal(result.lastWateredAt, wateredAt);
  assert.equal(result.entries.length, 2);
  assert.equal(read()[0].lastWateredAt, wateredAt);
  assert.equal(read()[1].lastWateredAt, null);
});

test('falha ao persistir rega nao devolve sucesso otimista', async () => {
  const { storage } = loadStorage(
    [{ savedId: 'one', category: 'tree', water: 'Medium', lastWateredAt: null }],
    { failWrites: true }
  );

  const result = await storage.markCollectionWatered('one', '2026-08-20T12:00:00.000Z');
  assert.equal(result, null);
});

test('duas identificacoes no mesmo milissegundo recebem savedIds distintos', async () => {
  const { storage } = loadStorage([]);
  const originalNow = Date.now;
  Date.now = () => 1770000000000;
  try {
    const first = await storage.saveToCollection({ id: 'provider-species', category: 'plant' });
    const second = await storage.saveToCollection({ id: 'provider-species', category: 'plant' });
    assert.notEqual(first.savedId, second.savedId);
  } finally {
    Date.now = originalNow;
  }
});

test('identidade do exemplar usa UUID seguro e nunca Math.random', () => {
  const source = fs.readFileSync(path.join(__dirname, 'components', 'storage.js'), 'utf8');
  assert.match(source, /Crypto\.randomUUID\(\)/);
  assert.doesNotMatch(source, /Math\.random\(/);
});

test('planta e arvore so atualizam a tela depois da confirmacao do storage', () => {
  for (const name of ['PlantDetailScreen.js', 'TreeDetailScreen.js']) {
    const source = readScreen(name);
    assert.match(source, /result = await markCollectionWatered\(savedEntryId\)/, name);
    assert.match(source, /if \(result\) \{\s*setLastWateredAt\(result\.lastWateredAt\)/, name);
    assert.match(source, /else \{\s*showAlert\(t\('common\.saveErrorTitle'\), t\('common\.saveErrorBody'\)\)/, name);
    assert.doesNotMatch(source, /updateCollectionEntry\(savedEntryId,\s*\{\s*lastWateredAt/, name);
  }
});

test('a confirmacao de rega muda o estado visivel sem celebrar uma falha', () => {
  for (const name of ['PlantDetailScreen.js', 'TreeDetailScreen.js']) {
    const source = readScreen(name);
    assert.match(source, /wateringStatus\.untracked\s*\?\s*t\('detail\.waterCheckToday'\)\s*:\s*t\('specimen\.timelineWatered'\)/, name);
    assert.match(source, /if \(result\) \{[\s\S]{0,240}NotificationFeedbackType\.Success/, name);
    assert.match(source, /else \{[\s\S]{0,180}NotificationFeedbackType\.Error/, name);
  }

  const specimen = readScreen('SpecimenScreen.js');
  assert.match(specimen, /wateringStatus\.untracked\s*\?\s*t\('detail\.waterCheckToday'\)\s*:\s*t\('specimen\.timelineWatered'\)/);
  assert.match(specimen, /if \(!result\) \{[\s\S]{0,180}NotificationFeedbackType\.Error/);
  assert.match(specimen, /NotificationFeedbackType\.Success/);
});

test('Meu Registro nao le savedId antes do exemplar carregar', () => {
  const specimen = readScreen('SpecimenScreen.js');
  const advancedStart = specimen.indexOf('const advancedWorkspace');
  const loadingGuard = specimen.indexOf('if (loading)');
  assert.ok(advancedStart >= 0 && loadingGuard > advancedStart);
  assert.match(
    specimen.slice(advancedStart, loadingGuard),
    /const advancedWorkspace = !entry[\s\S]*\? null/,
  );
  assert.match(specimen.slice(advancedStart, loadingGuard), /: entry\?\.category === 'crop'/);
});

test('ficha aberta pelo Meu Registro volta direto para a Colecao', () => {
  const specimen = readScreen('SpecimenScreen.js');
  const openGuide = specimen.slice(
    specimen.indexOf('const openGuide'),
    specimen.indexOf('const advancedWorkspace'),
  );
  assert.match(openGuide, /navigation\.replace\(meta\.detailRoute,/);
  assert.doesNotMatch(openGuide, /navigation\.navigate\(meta\.detailRoute,/);

  for (const detailRoute of COLLECTION_DETAIL_ROUTES) {
    const routeNames = ['CollectionHome', 'Specimen', detailRoute];
    const router = StackRouter({ initialRouteName: 'CollectionHome' });
    const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
    let state = router.getInitialState(options);
    state = router.getStateForAction(state, CommonActions.navigate('Specimen'), options);
    state = router.getStateForAction(state, StackActions.replace(detailRoute), options);
    state = router.getStateForAction(state, CommonActions.goBack(), options);

    assert.equal(state.index, 0, detailRoute);
    assert.deepEqual(state.routes.map((route) => route.name), ['CollectionHome'], detailRoute);
  }
});
