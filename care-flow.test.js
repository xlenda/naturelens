// Guarda do fluxo de cuidados contra duas mentiras silenciosas:
//
// 1. o calendario precisa respeitar o hemisferio e so pode chamar de "agora"
//    uma atividade que tem dado para a estacao atual;
// 2. intensidade de rega nunca vira um prazo inventado; a agenda inclui apenas
//    plantas e arvores e conserva somente eventos reais da pessoa.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const traverse = require('@babel/traverse').default;

const read = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

function loadExpoModule(relativePath, stubs = {}) {
  const file = path.join(__dirname, relativePath);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const fakeRequire = (name) => (name in stubs ? stubs[name] : require(name));
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

function findNode(node, predicate) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (predicate(node)) return node;
  return findNode(node.props?.children, predicate);
}

const watering = loadExpoModule(path.join('components', 'watering.js'));

const careSchedule = loadExpoModule(path.join('components', 'CareSchedule.js'), {
  react: { useEffect: () => {}, useState: () => [null, () => {}] },
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
  'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: (s) => s, hairlineWidth: 1 } },
  'react-i18next': { useTranslation: () => ({ t: (k) => k, i18n: { language: 'en' } }) },
  './SectionCard': () => null,
  './theme': { colors: {} },
  './scheduleContent': { getGroupSchedule: async () => null },
  './groupContent': { getGroups: async () => null },
  './careRegion': {
    getCareLatitude: async () => null,
    subscribeCareRegion: () => () => {},
  },
});

test('a estacao atual inverte entre os hemisferios', () => {
  assert.equal(careSchedule.seasonForMonth(6, 10), 'summer');
  assert.equal(careSchedule.seasonForMonth(6, -10), 'winter');
  assert.equal(careSchedule.seasonForMonth(0, 10), 'winter');
  assert.equal(careSchedule.seasonForMonth(0, -10), 'summer');
  assert.equal(careSchedule.seasonForMonth(6, null), null);
});

test('o resumo agora omite atividade sem dado na estacao', () => {
  const rows = [
    { activity: 'Water', summer: 'Weekly', winter: '' },
    { activity: 'Prune', summer: '', winter: 'Late winter' },
    { activity: 'Empty space', summer: '   ', winter: '' },
    { activity: 'Note only', note: 'No seasonal instruction' },
  ];

  assert.deepEqual(careSchedule.currentSeasonActions(rows, 'summer'), [
    { activity: 'Water', value: 'Weekly' },
  ]);
  assert.deepEqual(careSchedule.currentSeasonActions(rows, 'winter'), [
    { activity: 'Prune', value: 'Late winter' },
  ]);
  assert.deepEqual(careSchedule.currentSeasonActions(rows, null), []);
});

test('a agenda inclui planta e arvore, exclui animais e nao inventa vencimento', () => {
  const entries = [
    { savedId: 'plant-next', category: 'plant', water: 'Low (prefers dry soil)', lastWateredAt: '2026-08-18T12:00:00.000Z' },
    { savedId: 'tree-due', category: 'tree', water: 'Medium', lastWateredAt: '2026-08-10T12:00:00.000Z' },
    { savedId: 'plant-due', category: 'plant', water: 'High (prefers moist soil)', lastWateredAt: '2026-08-15T12:00:00.000Z' },
    { savedId: 'bird-fake', category: 'bird', water: 'High (prefers moist soil)', lastWateredAt: '2026-08-01T12:00:00.000Z' },
    { savedId: 'mushroom-fake', category: 'mushroom', water: 'Medium', lastWateredAt: '2026-08-01T12:00:00.000Z' },
    { savedId: 'insect-fake', category: 'insect', water: 'Low (prefers dry soil)', lastWateredAt: '2026-08-01T12:00:00.000Z' },
  ];

  const queue = watering.getCareQueue(entries);
  assert.deepEqual(queue.map((item) => item.entry.savedId), ['plant-next', 'tree-due', 'plant-due']);
  assert.deepEqual(queue.map((item) => item.status.level), [
    'Low (prefers dry soil)',
    'Medium',
    'High (prefers moist soil)',
  ]);
  for (const { status } of queue) {
    assert.equal('overdue' in status, false);
    assert.equal('dueInDays' in status, false);
  }
});

test('salvar uma identificacao pede checagem sem fingir rega ou prazo', () => {
  const status = watering.getWateringStatus(
    {
      category: 'plant',
      water: 'Medium',
      savedAt: '2026-08-20T11:59:00.000Z',
    }
  );

  assert.equal(status.level, 'Medium');
  assert.equal(status.lastWateredAt, null);
  assert.equal(status.untracked, true);
  assert.equal(watering.WATER_INTERVAL_DAYS, undefined);
});

test('a rega aceita o intervalo real do fornecedor e rejeita fauna mesmo com campo water', () => {
  const range = watering.getWateringStatus({
    category: 'plant',
    water: 'Low (prefers dry soil) to Medium',
  });

  assert.equal(range.level, 'Low (prefers dry soil) to Medium');
  assert.equal(range.untracked, true);
  assert.equal(
    watering.getWateringStatus({ category: 'fish', water: 'Medium' }),
    null
  );
});

test('telas usam nivel qualitativo e checagem sem prazo automatico', () => {
  const collection = read('screens/CollectionScreen.js');
  const plant = read('screens/PlantDetailScreen.js');
  const tree = read('screens/TreeDetailScreen.js');
  const specimen = read('screens/SpecimenScreen.js');
  const conditions = read('components/CareConditions.js');
  const profile = read('components/CareProfile.js');
  const topics = read('screens/CareTopicsScreen.js');
  const actionBar = read('components/ResultActionBar.js');

  assert.match(collection, /getCareQueue\(collection/);
  assert.match(collection, /markCollectionWatered\(item\.savedId\)/);
  assert.doesNotMatch(collection, /updateCollectionEntry\(item\.savedId,\s*\{\s*lastWateredAt/);
  assert.match(collection, /status\.untracked/);
  assert.match(collection, /i18n\.language/);
  assert.doesNotMatch(plant, /MonthInstructions/);
  assert.doesNotMatch(tree, /MonthInstructions/);
  for (const screen of [plant, tree]) {
    assert.doesNotMatch(screen, /lastWateredAt\s*\|\|\s*plant\.savedAt/);
    assert.doesNotMatch(screen, /setLastWateredAt\(entry\.savedAt/);
    assert.match(screen, /setLastWateredAt\(found\.lastWateredAt\s*\|\|\s*null\)/);
    assert.match(screen, /Monta sempre:[\s\S]{0,240}<SpeciesCareCard/);
  }
  for (const source of [collection, plant, tree, specimen, conditions, profile]) {
    assert.doesNotMatch(source, /WATER_INTERVAL_DAYS|everyNDays|waterCheckInDays|dueInDays|overdue/);
  }
  for (const source of [plant, tree, conditions, profile]) {
    assert.match(source, /shortFact\('water'/);
  }
  assert.match(topics, /!!active\.shortValue\s*&&/);
  assert.doesNotMatch(topics, /active\.shortValue\s*\|\|\s*active\.label/);
  assert.match(actionBar, /onPress=\{saved \? openSpecimen : onSave\}/);
  assert.match(actionBar, /saved \? t\('specimen\.openRecord'\)/);
  assert.doesNotMatch(actionBar, /saved \? t\('common\.removeFromCollection'\)/);

  const speciesCare = read('components/SpeciesCareCard.js');
  assert.match(speciesCare, /const layer = careLayer\(record, groupAdvice\);\s*if \(!layer\) return null;/);
});

test('o estado raiz esconde o dock do Meu Registro com um placeholder de altura zero', () => {
  const app = read('App.js');
  const tabBar = read('components/TwoRowTabBar.js');
  const jsx = (type, props) => ({ type, props: props || {} });
  const tabBarModule = loadExpoModule('components/TwoRowTabBar.js', {
    react: { useState: (value) => [value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      View: 'View',
      Text: 'Text',
      TouchableOpacity: 'TouchableOpacity',
      StyleSheet: { create: (styles) => styles },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
    './CategoryIcon': 'CategoryIcon',
    './CategoryPickerModal': 'CategoryPickerModal',
    './categories': { CATEGORIES: {} },
    './theme': {
      colors: { accent: '#090', background: '#fff', surface: '#fff', card: '#fff', border: '#ddd', text: '#111', textMuted: '#777' },
      control: { minTouch: 44 },
    },
  });
  const fullRootState = {
    index: 0,
    routes: [{
      name: 'Root',
      state: {
        index: 0,
        routes: [{
          name: 'Collection',
          state: {
            index: 1,
            routes: [
              { name: 'CollectionHome' },
              { name: 'Specimen' },
            ],
          },
        }],
      },
    }],
  };

  assert.match(app, /import SpecimenScreen from '\.\/screens\/SpecimenScreen'/);
  assert.match(app, /<CollectionStack\.Screen name="Specimen" component=\{SpecimenScreen\} \/>/);
  assert.equal(tabBarModule.focusedLeafNameFromState(fullRootState), 'Specimen');

  // O estado entregue a tabBar reproduz o bug real: so contem o tab pai.
  // A prop calculada no container precisa vencer esse recorte incompleto.
  const hiddenDock = tabBarModule.default({
    state: { index: 0, routes: [{ key: 'collection', name: 'Collection' }] },
    descriptors: {},
    navigation: {},
    focusedLeafRouteName: 'Specimen',
  });
  assert.equal(hiddenDock.type, 'View');
  assert.equal(hiddenDock.props.style.height, 0);

  assert.match(app, /const fullState = state \|\| navigationRef\.getRootState\(\)/);
  assert.match(app, /setFocusedLeafRouteName\(focusedLeafNameFromState\(fullState\)\)/);
  assert.match(app, /const handleNavigatorReady = \(\) => \{\s*syncFocusedLeaf\(\)/);
  assert.match(app, /onReady=\{handleNavigatorReady\}/);
  assert.match(app, /onStateChange=\{handleNavigationStateChange\}/);
  assert.match(
    app,
    /<TwoRowTabBar \{\.\.\.props\} focusedLeafRouteName=\{focusedLeafRouteName\} \/>/
  );
  assert.match(
    tabBar,
    /const leafRouteName = focusedLeafRouteName \|\| focusedLeafNameFromState\(state\)/
  );
});

test('Colecao e recentes abrem o exemplar pelo savedId exato', () => {
  const collection = read('screens/CollectionScreen.js');
  const identify = read('screens/IdentifyScreen.js');
  const collectionLinks = collection.match(
    /navigation\.navigate\('Specimen', \{ savedId: item\.savedId \}\)/g
  ) || [];

  assert.equal(collectionLinks.length, 2, 'lista e grade precisam abrir Meu Registro');
  assert.match(collection, /t\('specimen\.removeTitle'\)/);
  assert.match(collection, /const removalInFlightRef = useRef\(null\)/);
  assert.match(collection, /if \(!item\?\.savedId \|\| removalInFlightRef\.current\) return/);
  assert.match(collection, /gridCardWrap:\s*\{ width: '48%' \}/);
  assert.match(
    identify,
    /screen: 'Specimen',\s*params: \{ savedId: item\.savedId \}/
  );
  for (const source of [collection, identify]) {
    assert.doesNotMatch(source, /savedId:\s*item\.id\b/);
  }
});

test('a CTA salva abre Meu Registro e nunca cai no id do provedor', () => {
  const calls = [];
  let navigation = {
    getParent: () => ({ navigate: (...args) => calls.push(args) }),
    navigate: (...args) => calls.push(args),
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const ResultActionBar = loadExpoModule('components/ResultActionBar.js', {
    react: {},
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      View: 'View',
      Text: 'Text',
      TouchableOpacity: 'TouchableOpacity',
      StyleSheet: { create: (styles) => styles },
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@react-navigation/native': { useNavigation: () => navigation },
    './theme': { colors: { accent: '#090', background: '#fff', border: '#ddd', text: '#111', white: '#fff' } },
  }).default;

  const savedBar = ResultActionBar({ saved: true, savedId: 'exemplar-2', onSave: () => {} });
  const savedButton = findNode(
    savedBar,
    (node) => node.props?.accessibilityLabel === 'specimen.openRecord'
  );
  assert.ok(savedButton);
  savedButton.props.onPress();
  assert.deepEqual(calls, [[
    'Collection',
    { screen: 'Specimen', params: { savedId: 'exemplar-2' } },
  ]]);

  calls.length = 0;
  const providerOnly = ResultActionBar({ saved: true, id: 'provider-species', onSave: () => {} });
  findNode(providerOnly, (node) => node.props?.accessibilityLabel === 'specimen.openRecord').props.onPress();
  assert.deepEqual(calls, [], 'id da especie nao pode escolher um exemplar');
});

test('a timeline distingue salvar de regar e cuidado fica so em planta e arvore', () => {
  const specimen = read('screens/SpecimenScreen.js');
  const timelineStart = specimen.indexOf('const timeline = useMemo');
  const waterStart = specimen.indexOf("key: 'water'", timelineStart);
  const savedStart = specimen.indexOf("key: 'saved'", waterStart);
  const timelineEnd = specimen.indexOf('const showSaveError', savedStart);
  const waterEvent = specimen.slice(waterStart, savedStart);
  const savedEvent = specimen.slice(savedStart, timelineEnd);

  assert.ok(timelineStart >= 0 && waterStart > timelineStart && savedStart > waterStart);
  assert.match(waterEvent, /at: entry\.lastWateredAt/);
  assert.doesNotMatch(waterEvent, /entry\.savedAt/);
  assert.match(savedEvent, /at: entry\.savedAt/);
  assert.match(savedEvent, /timelineAdded/);
  assert.match(specimen, /const CARE_CATEGORIES = new Set\(\['plant', 'tree'\]\)/);
  assert.match(
    specimen,
    /entry && CARE_CATEGORIES\.has\(entry\.category\)\s*\? getWateringStatus\(entry\)\s*:\s*null/
  );
});

test('cogumelo sempre conserva o aviso de seguranca alimentar', () => {
  const specimen = read('screens/SpecimenScreen.js');
  const mushroom = read('screens/MushroomDetailScreen.js');
  const riskStart = specimen.indexOf("if (entry.category === 'mushroom')");
  const riskEnd = specimen.indexOf('\n  return null;', riskStart);
  const mushroomRisk = specimen.slice(riskStart, riskEnd);

  assert.ok(riskStart >= 0 && riskEnd > riskStart);
  assert.match(mushroomRisk, /foodSafety: true/);
  assert.doesNotMatch(mushroomRisk, /return null/);
  assert.match(specimen, /risk\.foodSafety &&[\s\S]*t\('terms\.accuracyBody'\)/);

  const ast = babel.parseSync(mushroom, {
    sourceType: 'module',
    parserOpts: { plugins: ['jsx'] },
  });
  let noticePath = null;
  traverse(ast, {
    JSXOpeningElement(current) {
      const style = current.node.attributes.find((attribute) => (
        attribute.type === 'JSXAttribute'
        && attribute.name?.name === 'style'
        && attribute.value?.expression?.type === 'MemberExpression'
        && attribute.value.expression.object?.name === 'styles'
        && attribute.value.expression.property?.name === 'edibilityNote'
      ));
      if (style) noticePath = current.parentPath;
    },
  });
  assert.ok(noticePath, 'MushroomDetail precisa renderizar o aviso alimentar');
  const conditional = noticePath.findParent((parent) => (
    parent.isLogicalExpression() || parent.isConditionalExpression()
  ));
  assert.equal(conditional, null, 'o aviso alimentar nao pode depender de edibility');
});
