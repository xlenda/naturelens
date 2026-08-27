// Guarda do primeiro loop de encantamento honesto: o resultado biologico abre
// antes da recompensa, e o recibo so mostra progresso realmente persistido.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const { uiLocaleFiles } = require('./test-locales');

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

test('NaturePrint prioriza o taxon cientifico e permanece estavel entre idiomas', () => {
  const { candidateIdentityKey } = loadExpoModule('components/scanOutcome.js', {
    './categories': { CATEGORIES: { plant: {} } },
    './missions': { TOKENS_PER_MISSION: 10, recordMissionEvent: async () => [] },
    './achievements': {
      getStreakInfo: async () => ({}),
      recordIdentification: async () => {},
      addTokens: async () => {},
      evaluateAchievements: async () => ({ newlyUnlocked: [] }),
    },
    './sentences': { firstSentence: (value) => value || null },
    './tracking': { trackAchievementUnlocked: () => {} },
  });

  assert.equal(candidateIdentityKey({
    name: 'Milho',
    scientific: 'Zea mays',
    identityV1: { taxon: { scientificName: 'Zea mays L.' } },
  }), 'Zea mays L.');
  assert.equal(candidateIdentityKey({ name: 'Milho', scientific: '  Zea   mays ' }), 'Zea mays');
  assert.equal(candidateIdentityKey({ name: 'Corn', scientific: 'Zea mays' }), 'Zea mays');
  assert.equal(candidateIdentityKey({ name: 'Milho' }), null);
  assert.equal(candidateIdentityKey({ name: 'Milho', identityV1: { status: 'unresolved' } }), null);
});

test('scanOutcome devolve somente o saldo e a sequencia confirmados no storage', async () => {
  const state = {
    currentStreak: 1,
    longestStreak: 3,
    totalIdentifications: 4,
    tokens: 40,
  };
  const calls = [];
  const { recordScanOutcome } = loadExpoModule('components/scanOutcome.js', {
    './categories': { CATEGORIES: { plant: {}, sound: {} } },
    './missions': {
      TOKENS_PER_MISSION: 10,
      recordMissionEvent: async (event, args) => {
        calls.push(['mission', event, args.category]);
        return ['scanAny2'];
      },
    },
    './achievements': {
      getStreakInfo: async () => ({ ...state }),
      recordIdentification: async () => {
        calls.push(['identification']);
        state.currentStreak = 2;
        state.totalIdentifications += 1;
        state.tokens += 5;
      },
      addTokens: async (amount) => {
        calls.push(['tokens', amount]);
        state.tokens += amount;
      },
      evaluateAchievements: async () => {
        calls.push(['achievements']);
        state.tokens += 15;
        return { newlyUnlocked: ['firstScan'] };
      },
    },
    './sentences': { firstSentence: (value) => value ? value.split('.')[0] + '.' : null },
    './tracking': {
      trackAchievementUnlocked: ({ achievementId }) => calls.push(['tracking', achievementId]),
    },
  });

  const outcome = await recordScanOutcome({
    category: 'plant',
    fact: '  Vendor fact.  ',
    identityKey: '  Zea   mays  ',
  });

  assert.deepEqual(calls, [
    ['identification'],
    ['mission', 'scan', 'plant'],
    ['tokens', 10],
    ['achievements'],
    ['tracking', 'firstScan'],
  ]);
  assert.deepEqual(outcome, {
    version: 1,
    recorded: true,
    category: 'plant',
    tokensEarned: 30,
    totalTokens: 70,
    currentStreak: 2,
    longestStreak: 3,
    totalIdentifications: 5,
    completedMissionIds: ['scanAny2'],
    achievementIds: ['firstScan'],
    vendorFact: 'Vendor fact.',
    identityKey: 'Zea mays',
  });
});

test('scanOutcome falha fechado e nunca celebra uma escrita que nao ocorreu', async () => {
  let missionCalls = 0;
  const state = { currentStreak: 0, longestStreak: 0, totalIdentifications: 0, tokens: 0 };
  const { recordScanOutcome } = loadExpoModule('components/scanOutcome.js', {
    './categories': { CATEGORIES: { plant: {} } },
    './missions': {
      TOKENS_PER_MISSION: 10,
      recordMissionEvent: async () => {
        missionCalls += 1;
        return ['scanAny2'];
      },
    },
    './achievements': {
      getStreakInfo: async () => ({ ...state }),
      recordIdentification: async () => {},
      addTokens: async () => {},
      evaluateAchievements: async () => ({ newlyUnlocked: ['firstScan'] }),
    },
    './sentences': { firstSentence: (value) => value || null },
    './tracking': { trackAchievementUnlocked: () => {} },
  });

  assert.equal(await recordScanOutcome({ category: 'plant', fact: 'not persisted' }), null);
  assert.equal(await recordScanOutcome({ category: 'invented' }), null);
  assert.equal(missionCalls, 0);
});

test('o pedido do recibo e serializavel e idempotente em remontagem', async () => {
  const state = { currentStreak: 0, longestStreak: 0, totalIdentifications: 0, tokens: 0 };
  let writes = 0;
  const mod = loadExpoModule('components/scanOutcome.js', {
    './categories': { CATEGORIES: { fish: {} } },
    './missions': { TOKENS_PER_MISSION: 10, recordMissionEvent: async () => [] },
    './achievements': {
      getStreakInfo: async () => ({ ...state }),
      recordIdentification: async () => {
        writes += 1;
        state.totalIdentifications += 1;
      },
      addTokens: async () => {},
      evaluateAchievements: async () => ({ newlyUnlocked: [] }),
    },
    './sentences': { firstSentence: (value) => value || null },
    './tracking': { trackAchievementUnlocked: () => {} },
  });

  const request = mod.createScanOutcomeRequest({
    category: 'fish',
    fact: 'Candidate fact.',
    identityKey: '  Pterophyllum   scalare ',
  });
  assert.doesNotThrow(() => JSON.stringify(request));
  assert.equal(request.identityKey, 'Pterophyllum scalare');
  const eligibility = mod.createRewardEligibility({
    category: 'fish',
    celebrationAllowed: true,
    riskLevel: 'safe',
  });
  const first = mod.recordScanOutcomeRequest(request, { eligibility });
  const remount = mod.recordScanOutcomeRequest({ ...request }, { eligibility: { ...eligibility } });
  assert.equal(first, remount);
  await Promise.all([first, remount]);
  assert.equal(writes, 1);
});

test('parecer pendente, desconhecido ou perigoso nao grava progresso nem envenena o cache', async () => {
  const state = { currentStreak: 0, longestStreak: 0, totalIdentifications: 0, tokens: 0 };
  const calls = [];
  const mod = loadExpoModule('components/scanOutcome.js', {
    './categories': { CATEGORIES: { fish: {}, plant: {}, sound: {} } },
    './missions': {
      TOKENS_PER_MISSION: 10,
      recordMissionEvent: async (event) => {
        calls.push(['mission', event]);
        return event === 'save' ? ['saveOne'] : [];
      },
    },
    './achievements': {
      getStreakInfo: async () => ({ ...state }),
      recordIdentification: async () => {
        calls.push(['identification']);
        state.totalIdentifications += 1;
        state.tokens += 5;
      },
      addTokens: async (amount) => {
        calls.push(['tokens', amount]);
        state.tokens += amount;
      },
      evaluateAchievements: async () => ({ newlyUnlocked: [] }),
    },
    './sentences': { firstSentence: (value) => value || null },
    './tracking': { trackAchievementUnlocked: () => {} },
  });

  const request = mod.createScanOutcomeRequest({
    category: 'fish',
    fact: 'Exact candidate.',
    identityKey: 'Pterophyllum scalare',
  });
  const pending = await mod.recordScanOutcomeRequest(request, {
    eligibility: mod.createRewardEligibility({ category: 'fish', safetyPending: true }),
    automaticSaveConfirmed: true,
  });
  assert.equal(pending.receiptReady, true);
  assert.equal(pending.recorded, false);
  assert.equal(pending.rewardStatus, 'pending');
  assert.deepEqual(calls, []);

  const unknown = await mod.recordScanOutcomeRequest(request, {
    eligibility: mod.createRewardEligibility({ category: 'fish', celebrationAllowed: false }),
    automaticSaveConfirmed: true,
  });
  assert.equal(unknown.rewardStatus, 'unknown');
  assert.deepEqual(calls, []);

  assert.equal(await mod.recordScanOutcome({
    category: 'plant',
    eligibility: mod.createRewardEligibility({ category: 'plant', riskLevel: 'danger' }),
    automaticSaveConfirmed: true,
  }), null);
  assert.deepEqual(calls, []);

  const safeEligibility = mod.createRewardEligibility({
    category: 'fish',
    celebrationAllowed: true,
    riskLevel: 'safe',
  });
  const safe = mod.recordScanOutcomeRequest(request, {
    eligibility: safeEligibility,
    automaticSaveConfirmed: true,
  });
  const remount = mod.recordScanOutcomeRequest({ ...request }, {
    eligibility: { ...safeEligibility },
    automaticSaveConfirmed: true,
  });
  assert.equal(safe, remount);
  const outcome = await safe;
  assert.equal(outcome.recorded, true);
  assert.deepEqual(calls, [
    ['identification'],
    ['mission', 'scan'],
    ['mission', 'save'],
    ['tokens', 10],
  ]);

  calls.length = 0;
  await mod.recordScanOutcome({ category: 'sound' });
  assert.deepEqual(calls.slice(0, 2), [
    ['identification'],
    ['mission', 'scan'],
  ]);
});

test('foto e som persistem o achado antes de abrir o resultado com o mesmo recibo', () => {
  const identify = read('screens/IdentifyScreen.js');
  const sound = read('screens/SoundScreen.js');

  for (const source of [identify, sound]) {
    assert.match(source, /import \{[^}]*createScanOutcomeRequest[^}]*\} from '\.\.\/components\/scanOutcome'/s);
    assert.match(source, /import \{ saveIdentificationAutomatically \} from '\.\.\/components\/automaticCollection'/);
    assert.doesNotMatch(source, /RevealFactModal|AchievementUnlockedModal|pendingNav|unlockedIds/);
    assert.match(source, /scanOutcomeRequest: outcomeRequest/);
  }

  const photoRequest = identify.indexOf('const outcomeRequest = createScanOutcomeRequest');
  const photoSave = identify.indexOf('await saveIdentificationAutomatically(identifiedEntity, category)', photoRequest);
  const photoNavigation = identify.indexOf('navigation.navigate(meta.detailRoute', photoRequest);
  assert.ok(photoRequest > 0 && photoSave > photoRequest && photoNavigation > photoSave);
  assert.match(identify, /plant: savedEntry/);
  assert.doesNotMatch(identify, /plant: savedEntry \|\| identifiedEntity/);
  assert.match(identify, /const scanInFlightRef = useRef\(false\)/);
  assert.match(identify, /if \(!primaryPhoto \|\| scanning \|\| scanInFlightRef\.current\) return/);
  assert.match(identify, /scanInFlightRef\.current = false;[\s\S]*setScanning\(false\)/);
  assert.doesNotMatch(identify.slice(photoRequest, photoSave), /photoBase64/);
  assert.match(identify, /candidateFact\(\{ category, entity \}\)/);
  assert.match(identify, /PHOTO_CONSENT_BODY_KEY/);
  assert.match(identify, /if \(err\.paymentRequired\)/);

  const soundRequest = sound.indexOf('const outcomeRequest = createScanOutcomeRequest');
  const soundSave = sound.indexOf("await saveIdentificationAutomatically(entity, 'sound')", soundRequest);
  const soundNavigation = sound.indexOf("navigation.navigate('SoundDetail'", soundRequest);
  assert.ok(soundRequest > 0 && soundSave > soundRequest && soundNavigation > soundSave);
  assert.match(sound, /plant: savedEntry/);
  assert.doesNotMatch(sound, /plant: savedEntry \|\| entity/);
  assert.doesNotMatch(sound.slice(soundRequest, soundSave), /clip\.base64/);
  assert.match(sound, /if \(err\.paymentRequired\)/);

  for (const screen of ['Fish', 'Bird', 'Sound']) {
    const detail = read(`screens/${screen}DetailScreen.js`);
    assert.match(detail, /updateCollectionEntry/);
    assert.match(detail, /updateCollectionEntry\(savedEntryId, (?:patch|\{ displayName \})\)/);
  }
  const fishDetail = read('screens/FishDetailScreen.js');
  assert.match(fishDetail, /curatedName \|\| localisedDisplayName \|\| plant\.displayName \|\| plant\.name/);
  const birdDetail = read('screens/BirdDetailScreen.js');
  assert.match(birdDetail, /curatedName \|\| localisedDisplayName \|\| plant\.name/);
  assert.match(birdDetail, /delete stablePlant\.displayName/);
});

test('salvamento automatico persiste a categoria sem liberar recompensa antes da seguranca', async () => {
  const calls = [];
  let payload = null;
  const { saveIdentificationAutomatically } = loadExpoModule('components/automaticCollection.js', {
    './categories': { CATEGORIES: { insect: { key: 'insect' } } },
    './storage': {
      saveToCollection: async (entity) => {
        payload = entity;
        return { ...entity, savedId: 'saved-insect' };
      },
    },
    './tracking': { trackResultSaved: (args) => calls.push(['tracking', args.category]) },
    './storeReview': { recordReviewEligibleMoment: async () => {} },
    './missions': {
      TOKENS_PER_MISSION: 10,
      recordMissionEvent: async (event) => {
        calls.push(['mission', event]);
        return ['saveOne'];
      },
    },
    './achievements': { addTokens: (amount) => calls.push(['tokens', amount]) },
  });

  const entry = await saveIdentificationAutomatically({ name: 'Joaninha', category: 'wrong' }, 'insect');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(payload.category, 'insect');
  assert.equal(entry.savedId, 'saved-insect');
  assert.deepEqual(calls, [['tracking', 'insect']]);
});

test('falha ou categoria invalida nunca finge salvamento automatico', async () => {
  let saves = 0;
  let sideEffects = 0;
  const { saveIdentificationAutomatically } = loadExpoModule('components/automaticCollection.js', {
    './categories': { CATEGORIES: { plant: { key: 'plant' } } },
    './storage': {
      saveToCollection: async () => {
        saves += 1;
        return null;
      },
    },
    './tracking': { trackResultSaved: () => { sideEffects += 1; } },
    './storeReview': { recordReviewEligibleMoment: async () => { sideEffects += 1; } },
    './missions': { TOKENS_PER_MISSION: 10, recordMissionEvent: async () => { sideEffects += 1; return []; } },
    './achievements': { addTokens: () => { sideEffects += 1; } },
  });

  assert.equal(await saveIdentificationAutomatically({ name: 'Folha' }, 'invented'), null);
  assert.equal(await saveIdentificationAutomatically({ name: 'Folha' }, 'plant'), null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saves, 1);
  assert.equal(sideEffects, 0);
});

test('o fato curto usa a categoria real e some quando a identidade nao foi resolvida', () => {
  const { candidateFact } = loadExpoModule('components/scanOutcome.js', {
    './categories': { CATEGORIES: {} },
    './missions': { TOKENS_PER_MISSION: 0, recordMissionEvent: async () => [] },
    './achievements': {},
    './sentences': { firstSentence: (value) => value ? value.split('.')[0] + '.' : null },
    './tracking': { trackAchievementUnlocked: () => {} },
  });

  assert.equal(candidateFact({
    category: 'fish',
    entity: { identityV1: { status: 'exact' }, overview: 'Lives near reefs. Long second paragraph.' },
  }), 'Lives near reefs.');
  assert.equal(candidateFact({
    category: 'insect',
    entity: { identityV1: { status: 'candidate' }, role: 'Pollinates flowers. More.' },
  }), 'Pollinates flowers.');
  assert.equal(candidateFact({
    category: 'fish',
    entity: { identityV1: { status: 'unresolved' }, overview: 'Must stay hidden.' },
  }), null);
  assert.equal(candidateFact({ category: 'bird', entity: { identityV1: { status: 'exact' } } }), null);
});

test('as oito fichas montam o recibo entre evidencia e aprendizado', () => {
  const files = ['Plant', 'Tree', 'Crop', 'Insect', 'Mushroom', 'Bird', 'Fish', 'Sound'];
  for (const name of files) {
    const source = read(`screens/${name}DetailScreen.js`);
    assert.match(source, /import DiscoveryReceiptCard from '\.\.\/components\/DiscoveryReceiptCard'/, name);
    assert.match(source, /scanOutcome/, name);
    assert.match(source, /request=\{scanOutcomeRequest\}/, name);
    assert.match(
      source,
      /automaticSaveConfirmed=\{fromIdentify === true && !!plant\.savedId\}/,
      `${name}: recompensa do auto-save passa pelo parecer da ficha`
    );
    const evidence = source.indexOf('<IdentificationExtras');
    const receipt = source.indexOf('<DiscoveryReceiptCard', evidence);
    const learning = source.indexOf('<DidacticFieldGuide', receipt);
    assert.ok(evidence >= 0 && receipt > evidence && learning > receipt, name);
    assert.match(source, new RegExp(`trackResultSaved\\(\\{ category: '${name.toLowerCase()}' \\}\\)`), name);
  }
  assert.match(read('screens/FishDetailScreen.js'), /safetyPending=\{!safetyLookupDone\}/);
});

test('o recibo e inline, omite fato ausente e rejeita conquista desconhecida', () => {
  const source = read('components/DiscoveryReceiptCard.js');
  assert.doesNotMatch(source, /<Modal|Touchable|Animated|Math\.random|countdown|expires|lose/i);
  assert.match(source, /resolved\.recorded !== true && resolved\.receiptReady !== true/);
  const safetyGate = source.indexOf('if (!rewardEligibilityAllowsProgress(eligibility, request.category))');
  const persistence = source.indexOf('recordScanOutcomeRequest(request, { eligibility, automaticSaveConfirmed })');
  assert.ok(safetyGate > 0 && persistence > safetyGate);
  assert.match(source, /!!vendorFact &&/);

  const Receipt = loadExpoModule('components/DiscoveryReceiptCard.js', {
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
    'react-i18next': {
      useTranslation: () => ({
        t: (key, args = {}) => (args.title ? `${key}:${args.title}` : key),
      }),
    },
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
  }).default;

  assert.equal(Receipt({ outcome: null }), null);

  const withoutFact = Receipt({
    outcome: { version: 1, recorded: true, tokensEarned: 5, currentStreak: 1, achievementIds: [] },
  });
  assert.doesNotMatch(JSON.stringify(withoutFact), /discoveryReceipt\.factTitle/);

  const withFact = Receipt({
    outcome: {
      version: 1,
      recorded: true,
      tokensEarned: 20,
      currentStreak: 2,
      achievementIds: ['invented', 'firstScan'],
      vendorFact: 'Only vendor data',
    },
  });
  const rendered = JSON.stringify(withFact);
  assert.match(rendered, /Only vendor data/);
  assert.match(rendered, /discoveryReceipt\.factTitle/);
  assert.match(rendered, /achievements\.firstScan\.title/);
  assert.doesNotMatch(rendered, /achievements\.invented\.title/);
});

test('os 17 idiomas possuem o recibo completo e preservam interpolacoes', () => {
  const files = uiLocaleFiles();
  assert.equal(files.length, 17);
  const keys = ['title', 'ready', 'tokens', 'streak', 'achievement', 'factTitle', 'saveHint'];

  for (const file of files) {
    const locale = JSON.parse(read(`public/locales/${file}`));
    assert.deepEqual(Object.keys(locale.discoveryReceipt || {}).sort(), [...keys].sort(), file);
    for (const key of keys) {
      assert.ok(locale.discoveryReceipt[key].trim(), `${file}: discoveryReceipt.${key}`);
    }
    assert.match(locale.discoveryReceipt.tokens, /\{\{count\}\}/, file);
    assert.match(locale.discoveryReceipt.streak, /\{\{count\}\}/, file);
    assert.match(locale.discoveryReceipt.achievement, /\{\{title\}\}/, file);
  }
});
