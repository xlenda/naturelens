const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const read = (relative) => fs.readFileSync(path.join(__dirname, relative), 'utf8');

function loadExpoModule(relative, stubs = {}) {
  const { code } = babel.transformFileSync(path.join(__dirname, relative), {
    presets: ['babel-preset-expo'],
  });
  const mod = { exports: {} };
  const fakeRequire = (name) => (name in stubs ? stubs[name] : require(name));
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

function jsx(type, props) {
  return { type, props: props || {} };
}

test('preferencias sensoriais validam, persistem e notificam sem perder mudanca concorrente', async () => {
  const storage = new Map();
  const writes = [];
  const preferences = loadExpoModule('components/sensoryPreferences.js', {
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => storage.get(key) ?? null,
      setItem: async (key, value) => {
        writes.push([key, value]);
        storage.set(key, value);
      },
    },
  });

  assert.deepEqual(await preferences.getSensoryPreferences(), {
    hapticsEnabled: true,
    motionMode: 'system',
  });

  const notifications = [];
  const unsubscribe = preferences.subscribeSensoryPreferences((value) => notifications.push(value));
  const [motionResult, hapticsResult] = await Promise.all([
    preferences.setSensoryPreference('motionMode', 'reduced'),
    preferences.setSensoryPreference('hapticsEnabled', false),
  ]);
  unsubscribe();

  assert.equal(motionResult.motionMode, 'reduced');
  assert.deepEqual(hapticsResult, { hapticsEnabled: false, motionMode: 'reduced' });
  assert.deepEqual(JSON.parse(writes.at(-1)[1]), hapticsResult);
  assert.deepEqual(notifications.at(-1), hapticsResult);
  assert.throws(
    () => preferences.setSensoryPreference('motionMode', 'cinematic'),
    /Invalid sensory preference/
  );
  assert.throws(
    () => preferences.setSensoryPreference('hapticsEnabled', 'yes'),
    /Invalid sensory preference/
  );
});

test('preferencias corrompidas ou storage indisponivel falham para defaults seguros', async () => {
  for (const getItem of [async () => '{bad-json', async () => { throw new Error('offline'); }]) {
    const preferences = loadExpoModule('components/sensoryPreferences.js', {
      '@react-native-async-storage/async-storage': { getItem, setItem: async () => {} },
    });
    assert.deepEqual(await preferences.getSensoryPreferences(), {
      hapticsEnabled: true,
      motionMode: 'system',
    });
  }
});

test('servico haptico respeita preferencia, usa semantica e nunca quebra a acao', async () => {
  let enabled = true;
  const calls = [];
  const Haptics = {
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
    NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
    selectionAsync: async () => calls.push(['selection']),
    impactAsync: async (style) => calls.push(['impact', style]),
    notificationAsync: async (type) => calls.push(['notification', type]),
  };
  const feedback = loadExpoModule('components/sensoryFeedback.js', {
    'expo-haptics': Haptics,
    './sensoryPreferences': {
      getSensoryPreferences: async () => ({ hapticsEnabled: enabled, motionMode: 'system' }),
    },
  });

  assert.equal(await feedback.selection(), true);
  assert.equal(await feedback.open(), true);
  assert.equal(await feedback.commit(), true);
  assert.equal(await feedback.success(), true);
  assert.equal(await feedback.warning(), true);
  assert.equal(await feedback.error(), true);
  assert.deepEqual(calls, [
    ['selection'],
    ['impact', 'light'],
    ['impact', 'medium'],
    ['notification', 'success'],
    ['notification', 'warning'],
    ['notification', 'error'],
  ]);

  enabled = false;
  assert.equal(await feedback.success(), false);
  assert.equal(calls.length, 6);

  const unsupported = loadExpoModule('components/sensoryFeedback.js', {
    'expo-haptics': {
      ...Haptics,
      selectionAsync: async () => { throw new Error('unsupported'); },
    },
    './sensoryPreferences': {
      getSensoryPreferences: async () => ({ hapticsEnabled: true, motionMode: 'system' }),
    },
  });
  assert.equal(await unsupported.selection(), false);
});

test('override de movimento vence a preferencia do sistema', () => {
  const motion = loadExpoModule('components/useReducedMotion.js', {
    react: { useEffect: () => {}, useState: () => [false, () => {}] },
    'react-native': { AccessibilityInfo: {}, Platform: { OS: 'android' } },
    './sensoryPreferences': {
      DEFAULT_SENSORY_PREFERENCES: { motionMode: 'system' },
      MOTION_MODES: { SYSTEM: 'system', REDUCED: 'reduced', FULL: 'full' },
      getSensoryPreferences: async () => ({ motionMode: 'system' }),
      subscribeSensoryPreferences: () => () => {},
    },
  });

  assert.equal(motion.resolveReducedMotion('system', true), true);
  assert.equal(motion.resolveReducedMotion('system', false), false);
  assert.equal(motion.resolveReducedMotion('reduced', false), true);
  assert.equal(motion.resolveReducedMotion('full', true), false);

  const source = read('components/useReducedMotion.js');
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /isReduceMotionEnabled/);
  assert.match(source, /reduceMotionChanged/);
});

test('recibo suprime recompensas quando recebe risco logico grave', () => {
  const ReceiptModule = loadExpoModule('components/DiscoveryReceiptCard.js', {
    react: {
      useState: (initial) => [initial, () => {}],
      useEffect: (effect) => effect(),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      View: 'View',
      Text: 'Text',
      StyleSheet: { create: (styles) => styles },
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
    './achievements': { ACHIEVEMENT_LIST: [{ id: 'firstScan' }] },
    './scanOutcome': {
      createRewardEligibility: () => ({ version: 1, category: 'plant', status: 'not_required' }),
      recordScanOutcomeRequest: async () => null,
    },
    './AcquisitionSourceCard': () => null,
    './NaturePrint': () => null,
    './theme': {
      colors: {
        accent: '#090', card: '#111', text: '#fff', textMuted: '#999', textSecondary: '#ddd',
        warning: '#fc0', surface: '#222', border: '#333',
      },
      shadow: {},
    },
  });

  assert.equal(ReceiptModule.shouldCelebrateDiscovery({ riskLevel: 'danger' }), false);
  assert.equal(ReceiptModule.shouldCelebrateDiscovery({ riskLevel: 'warning' }), false);
  assert.equal(ReceiptModule.shouldCelebrateDiscovery({ riskLevel: 'deadly' }), false);
  assert.equal(ReceiptModule.shouldCelebrateDiscovery({ riskLevel: 'safe' }), true);
  assert.equal(ReceiptModule.shouldCelebrateDiscovery({ celebrationAllowed: false }), false);

  const rendered = JSON.stringify(ReceiptModule.default({
    riskLevel: 'danger',
    outcome: {
      version: 1,
      recorded: true,
      tokensEarned: 20,
      currentStreak: 3,
      achievementIds: ['firstScan'],
      vendorFact: 'Vendor fact.',
    },
  }));
  assert.doesNotMatch(rendered, /discoveryReceipt\.tokens|discoveryReceipt\.streak|achievements\.firstScan/);
  assert.match(rendered, /Vendor fact/);
  assert.match(rendered, /bookmark-outline/);
});

test('componentes autorizados usam o servico e expõem loading e feedback acessiveis', () => {
  const files = [
    'components/HelpfulRow.js',
    'screens/MonthlyRecapScreen.js',
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /from 'expo-haptics'/, file);
    assert.match(read(file), /sensoryFeedback/, file);
  }

  const pressScale = read('components/PressScale.js');
  assert.match(pressScale, /useReducedMotion/);
  assert.match(pressScale, /animation\.current\?\.stop\(\)/);

  const helpful = read('components/HelpfulRow.js');
  assert.match(helpful, /detail\.feedbackThanks/);
  assert.match(helpful, /accessibilityLiveRegion="polite"/);

  const missions = read('components/DailyMissionsCard.js');
  assert.match(missions, /common\.loading/);
  assert.match(missions, /missions\.completedAnnouncement/);
  assert.match(missions, /missions\.progressStatus/);

  const recap = read('screens/MonthlyRecapScreen.js');
  assert.match(recap, /collection\.emptyCta/);
  assert.match(recap, /accessibilityRole="progressbar"/);
  assert.match(recap, /accessibilityState=\{\{ disabled: sharing, busy: sharing \}\}/);
});
