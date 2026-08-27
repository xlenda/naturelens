// Guardas do fluxo 3S: poucas decisoes, captura obvia e dossie completo por padrao.

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

test('onboarding faz somente tres perguntas que mudam a experiencia', () => {
  const source = read('screens/OnboardingScreen.js');
  assert.match(source, /const STEPS = \['intro', 'promise', 'goal', 'context', 'depth', 'ready'\]/);
  assert.deepEqual(
    [...source.matchAll(/^  ([a-z]+): \[$/gm)].map((match) => match[1]),
    ['goal', 'context', 'depth']
  );
  assert.match(source, /saveDiscoveryPreferences\(nextPreferences\)/);
  assert.match(source, /suggestedCategoryForContext\(completedAnswers\.context\)/);
  assert.match(source, /finish\(\{ skipped: true \}\)/);
});

test('onboarding abre com o video do mascote antes das perguntas', () => {
  const source = read('screens/OnboardingScreen.js');
  const webVideo = read('components/IntroMascotVideo.js');
  const nativeVideo = read('components/IntroMascotVideo.native.js');
  const videoPath = path.join(__dirname, 'assets/art/naturelens-mascot-intro-fast.mp4');
  const posterPath = path.join(__dirname, 'assets/art/naturelens-mascot-intro-poster.jpg');
  const videoBytes = fs.readFileSync(videoPath);

  assert.ok(fs.existsSync(videoPath), 'video do mascote precisa estar nos assets');
  assert.ok(fs.existsSync(posterPath), 'primeiro quadro precisa aparecer antes do download');
  assert.ok(videoBytes.length < 2_000_000, 'video inicial precisa ficar abaixo de 2 MB');
  assert.notEqual(videoBytes.indexOf(Buffer.from('avc1')), -1, 'H.264 funciona nos navegadores alvo');
  assert.notEqual(videoBytes.indexOf(Buffer.from('mp4a')), -1, 'a versao leve conserva o audio');
  assert.ok(
    videoBytes.indexOf(Buffer.from('moov')) < videoBytes.indexOf(Buffer.from('mdat')),
    'fast-start precisa publicar o indice antes dos quadros'
  );
  assert.match(source, /import IntroMascotVideo from '\.\.\/components\/IntroMascotVideo'/);
  assert.match(webVideo, /const POSTER = require\('\.\.\/assets\/art\/naturelens-mascot-intro-poster\.jpg'\)/);
  assert.match(webVideo, /const VIDEO = require\('\.\.\/assets\/art\/naturelens-mascot-intro-fast\.mp4'\)/);
  assert.match(webVideo, /const \[muted, setMuted\] = useState\(true\)/);
  assert.match(webVideo, /const allowMotion = !reduceMotion && !savesData/);
  assert.match(webVideo, /onPlaying: \(\) => \{/);
  assert.match(webVideo, /preload: 'auto'/);
  assert.match(webVideo, /<Image source=\{POSTER\}/);
  assert.match(source, /const isIntro = current === 'intro'/);
  assert.match(source, /current === 'intro' && <IntroMascotVideo/);
  assert.match(source, /current === 'promise' && <PromiseDemo/);
  assert.match(webVideo, /React\.createElement\('video'/);
  assert.match(nativeVideo, /useVideoPlayer/);
  assert.match(nativeVideo, /<VideoView/);
  assert.match(source, /styles\.introFooter/);
  assert.match(source, /const canContinue = !isQuestion \|\| Boolean\(answers\[current\]\)/);
  assert.match(source, /<Image source=\{SCENES\.promise\} style=\{styles\.demoImage\}/);

  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(
    vercel.headers.some((rule) =>
      rule.source === '/assets/(.*)'
      && rule.headers.some((header) => header.key === 'Cache-Control'
        && header.value === 'public, max-age=31536000, immutable')
    ),
    'asset com hash precisa ficar no CDN e no service worker depois da primeira visita'
  );
});

test('onboarding nao condiciona entrada a avaliacao nem pede estrelas antes do uso', () => {
  const source = read('screens/OnboardingScreen.js');
  assert.doesNotMatch(source, /ReviewPrelude|recordPositiveReviewSignal|current === 'review'/);
  assert.doesNotMatch(source, /5 estrelas|five-star|requestReview/i);
  assert.match(source, /if \(isLast\) \{\s*await finish\(\)/);
});

test('preferencias de descoberta persistem somente valores validos', async () => {
  const memory = new Map();
  const preferences = loadExpoModule('components/discoveryPreferences.js', {
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => memory.set(key, value),
    },
  });

  const saved = await preferences.saveDiscoveryPreferences({
    goal: 'care',
    context: 'water',
    depth: 'visual',
  });
  assert.deepEqual(saved, {
    version: 1,
    goal: 'care',
    context: 'water',
    depth: 'visual',
    preferredCategory: 'fish',
  });
  assert.deepEqual(await preferences.getDiscoveryPreferences(), saved);

  const safe = await preferences.saveDiscoveryPreferences({
    goal: 'invented',
    context: 'invented',
    depth: 'invented',
  });
  assert.equal(safe.goal, 'identify');
  assert.equal(safe.context, 'nature');
  assert.equal(safe.depth, 'essential');

  await Promise.all([
    preferences.updateDiscoveryPreferences({ goal: 'safety' }),
    preferences.updateDiscoveryPreferences({ context: 'field' }),
  ]);
  const merged = await preferences.getDiscoveryPreferences();
  assert.equal(merged.goal, 'safety');
  assert.equal(merged.context, 'field');
});

test('captura central continua no fluxo e abre a categoria lembrada', () => {
  const source = read('components/TwoRowTabBar.js');
  const dockStyle = source.slice(source.indexOf('dock: {'), source.indexOf('hiddenDock:'));
  assert.match(source, /identify\.centralCapture/);
  assert.match(source, /captureRequestId/);
  assert.match(source, /natureLensRememberCategory/);
  assert.doesNotMatch(dockStyle, /position\s*:\s*['"]absolute['"]/);
  assert.match(source, /hiddenDock: \{ height: 0 \}/);
});

test('Pulso Vivo exige gesto deliberado, respeita acessibilidade e usa feedback centralizado', () => {
  const identify = read('screens/IdentifyScreen.js');
  const sound = read('screens/SoundScreen.js');
  const pulse = read('components/LensPulseButton.js');
  const receipt = read('components/DiscoveryReceiptCard.js');
  const naturePrint = read('components/NaturePrint.js');
  const renderGate = read('scripts/e2e-render.js');
  const pulseProof = read('scripts/proof-lens-pulse.js');

  assert.match(identify, /import LensPulseButton/);
  assert.match(identify, /<LensPulseButton/);
  assert.match(identify, /onComplete=\{requestPhotoConsent\}/);
  assert.match(identify, /identityKey: candidateIdentityKey\(entity\)/);
  assert.match(sound, /identityKey: candidateIdentityKey\(entity\)/);
  assert.doesNotMatch(identify, /from 'expo-haptics'/);
  assert.match(sound, /<LensPulseButton[\s\S]*onComplete=\{revealPendingClip\}/);
  assert.match(sound, /pendingClipRef\.current = null/);

  const timing = loadExpoModule('components/lensPulseTiming.js');
  assert.equal(timing.LENS_PULSE_HOLD_MS, 820);
  assert.equal(timing.lensPulseReachedThreshold(819), false);
  assert.equal(timing.lensPulseReachedThreshold(820), true);
  assert.match(pulse, /<Pressable/);
  assert.match(pulse, /onPressIn=\{start\}/);
  assert.match(pulse, /onPressOut=\{release\}/);
  assert.match(pulse, /onLongPress=\{Platform\.OS === 'web' \? preventWebGestureDefault : undefined\}/);
  assert.match(pulse, /delayLongPress=\{LENS_PULSE_HOLD_MS\}/);
  assert.match(pulse, /createLensPulseController/);
  assert.doesNotMatch(pulse, /\.start\(\(\{ finished \}\)/);
  assert.match(pulse, /useNativeDriver: true/);
  assert.match(pulse, /useReducedMotion\(\)/);
  assert.match(pulse, /sensoryFeedback\.(open|selection|commit)/);
  assert.match(pulse, /accessibilityActions=\{\[\{ name: 'activate'/);
  assert.match(pulse, /nativeEvent\.actionName === 'activate'/);
  assert.match(pulse, /if \(phase === 'awaitingConsent' \|\| phase === 'disposed'\) return/);
  assert.match(pulse, /if \(phase === 'holding'\) controllerRef\.current\?\.cancel\(\)/);
  assert.match(pulse, /userSelect:\s*'none'/);
  assert.match(pulse, /touchAction:\s*'none'/);
  assert.match(pulse, /onContextMenu=\{Platform\.OS === 'web' \? preventWebGestureDefault : undefined\}/);
  assert.match(identify, /const ViewfinderContainer = primaryPhoto \? View : TouchableOpacity/);

  assert.match(receipt, /<NaturePrint/);
  assert.match(receipt, /naturePrintAllowed && !!resolved\.identityKey/);
  assert.match(naturePrint, /naturePrintHash/);
  assert.doesNotMatch(naturePrint, /Math\.random/);
  assert.match(renderGate, /proof-lens-pulse\.js/);
  assert.match(pulseProof, /style\.userSelect/);
  assert.match(pulseProof, /selection: window\.getSelection/);
  assert.match(pulseProof, /dispatchTouchEvent/);
  assert.match(pulseProof, /MouseEvent\('contextmenu'/);
  assert.match(pulseProof, /Consentimento nao abriu apos gesto touch sustentado/);
  assert.match(pulseProof, /\^\(Enviar foto para identificar\|Upload photo to identify\)\$/);
  assert.match(pulseProof, /const chooserPromise = new Promise/);
  assert.match(pulseProof, /await DOM\.setFileInputFiles/);
  assert.match(pulseProof, /waitForValue\(targetExpression, 10000\)/);
  assert.doesNotMatch(pulseProof, /sleep\(1600\)/);
});

test('controlador do Pulso Vivo prova cancelamento, limite e idempotencia', () => {
  const makeClock = () => {
    let now = 0;
    let sequence = 0;
    const tasks = new Map();
    return {
      schedule(fn, delay) {
        const id = ++sequence;
        tasks.set(id, { at: now + delay, fn });
        return id;
      },
      cancel(id) { tasks.delete(id); },
      advance(ms) {
        const target = now + ms;
        while (true) {
          const due = [...tasks.entries()]
            .filter(([, task]) => task.at <= target)
            .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
          if (!due) break;
          const [id, task] = due;
          tasks.delete(id);
          now = task.at;
          task.fn();
        }
        now = target;
      },
    };
  };
  const loadController = () => loadExpoModule('components/lensPulseController.js', {
    './lensPulseTiming': { LENS_PULSE_HOLD_MS: 820 },
  }).createLensPulseController;

  const earlyClock = makeClock();
  let earlyCompletions = 0;
  const early = loadController()({
    schedule: earlyClock.schedule,
    cancelScheduled: earlyClock.cancel,
    onComplete: () => { earlyCompletions += 1; },
  });
  assert.equal(early.start(), true);
  earlyClock.advance(819);
  assert.equal(earlyCompletions, 0);
  assert.equal(early.release(), 'cancelled');
  earlyClock.advance(1000);
  assert.equal(earlyCompletions, 0, 'callback obsoleto nao conclui');

  const completeClock = makeClock();
  let midpoint = 0;
  let completions = 0;
  const complete = loadController()({
    schedule: completeClock.schedule,
    cancelScheduled: completeClock.cancel,
    onMidpoint: () => { midpoint += 1; },
    onComplete: () => { completions += 1; },
  });
  assert.equal(complete.start(), true);
  assert.equal(complete.start(), false, 'dois inicios nao armam dois timers');
  completeClock.advance(820);
  assert.equal(midpoint, 1);
  assert.equal(completions, 1);
  completeClock.advance(1000);
  assert.equal(completions, 1, 'conclusao acontece uma vez');
  assert.equal(complete.release(), 'completed');

  const accessibleClock = makeClock();
  let accessibleCompletions = 0;
  const accessible = loadController()({
    schedule: accessibleClock.schedule,
    cancelScheduled: accessibleClock.cancel,
    onComplete: () => { accessibleCompletions += 1; },
  });
  assert.equal(accessible.activate(), true);
  assert.equal(accessible.activate(), false, 'acao acessivel repetida nao rearma o consentimento');
  assert.equal(accessibleCompletions, 1);

  const disposedClock = makeClock();
  let disposedCompletions = 0;
  const disposed = loadController()({
    schedule: disposedClock.schedule,
    cancelScheduled: disposedClock.cancel,
    onComplete: () => { disposedCompletions += 1; },
  });
  disposed.start();
  disposed.dispose();
  disposedClock.advance(1000);
  assert.equal(disposedCompletions, 0);
});

test('Pulso Vivo esta traduzido em todos os idiomas de interface', () => {
  const files = uiLocaleFiles();
  assert.equal(files.length, 17);
  for (const file of files) {
    const locale = JSON.parse(read(`public/locales/${file}`));
    assert.ok(locale.identify.lensPulseEyebrow?.trim(), file);
    assert.ok(locale.identify.holdToReveal?.trim(), file);
    assert.ok(locale.identify.keepHolding?.trim(), file);
    assert.ok(locale.identify.holdToRevealHint?.trim(), file);
  }
});

test('as oito fichas oferecem revelacao e proxima melhor foto', () => {
  const names = ['Plant', 'Tree', 'Crop', 'Mushroom', 'Insect', 'Fish', 'Bird', 'Sound'];
  for (const name of names) {
    const source = read(`screens/${name}DetailScreen.js`);
    assert.match(source, /<LensRevealCard/, name);
    assert.match(source, /<NextBestCaptureCard/, name);
    assert.match(source, /identityStatus=\{plant\.identityV1\?\.status\}/, name);
    assert.match(source, /resultName=\{plant\.name \|\| plant\.scientific\}/, name);
    assert.match(source, /onRetake=\{\(\) => retakeResult\(/, name);
  }
});

test('as oito fichas abrem completas no Tecnico sem preferencia antiga esconder dados', () => {
  const complete = ['Plant', 'Tree', 'Crop', 'Mushroom', 'Insect', 'Fish', 'Bird', 'Sound'];
  for (const name of complete) {
    const source = read(`screens/${name}DetailScreen.js`);
    assert.match(source, /const resultDepth = RESULT_DEPTHS\.EXPERT;/, name);
    assert.doesNotMatch(source, /<ResultDepthSwitcher/, name);
    assert.doesNotMatch(source, /useResultDepthPreference/, name);
    assert.match(source, /<ResultDepthLayer/, name);
    assert.match(source, /depth=\{RESULT_DEPTHS\.ESSENTIAL\}/, name);
    assert.match(source, /depth=\{RESULT_DEPTHS\.VISUAL\}/, name);
    assert.match(source, /depth=\{RESULT_DEPTHS\.EXPERT\}/, name);
    assert.match(source, /<TopicNavigatorCard/, name);
  }

  const insect = read('screens/InsectDetailScreen.js');
  assert.match(insect, /<GroupGuideCard/);
});

test('resultado que parou no genero explica as abas ausentes e pede nova captura', () => {
  const nextCapture = loadExpoModule('components/NextBestCaptureCard.js', {
    react: require('react'),
    'react-native': {
      StyleSheet: { create: (styles) => styles },
      Text: () => null,
      TouchableOpacity: () => null,
      View: () => null,
    },
    '@expo/vector-icons': { Ionicons: () => null },
    'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
    './theme': {
      colors: { accent: '#52A875', card: '#101915', text: '#fff', textMuted: '#aaa', white: '#fff' },
      control: { minTouch: 44 },
      radius: { sm: 8, md: 12 },
      space: { xs: 4, sm: 8, md: 16 },
      type: { cardTitle: {}, caption: {}, body: {} },
    },
  });

  assert.equal(nextCapture.identityNeedsAnotherCapture('unresolved'), true);
  assert.equal(nextCapture.identityNeedsAnotherCapture('candidate'), true);
  assert.equal(nextCapture.identityNeedsAnotherCapture('exact'), false);
  assert.equal(nextCapture.shouldSuggestNextCapture({
    fromIdentify: false,
    category: 'insect',
    confidence: 99,
    alternatives: null,
    identityStatus: 'unresolved',
  }), true, 'Hylesia salvo continua explicando que ainda nao e uma especie');
  assert.equal(nextCapture.shouldSuggestNextCapture({
    fromIdentify: true,
    category: 'insect',
    confidence: 99,
    alternatives: null,
    identityStatus: 'exact',
  }), false, 'uma especie exata e confiante nao pede foto sem motivo');

  const { retakeResult } = loadExpoModule('components/resultRetake.js', {
    './categories': {
      CATEGORIES: {
        plant: { tabLabel: 'Plants' },
        tree: { tabLabel: 'Trees' },
        insect: { tabLabel: 'Insects' },
        sound: { tabLabel: 'Sounds' },
      },
    },
  });
  let wentBack = 0;
  const direct = { goBack: () => { wentBack += 1; } };
  assert.equal(retakeResult({ navigation: direct, category: 'insect', fromIdentify: true }), true);
  assert.equal(wentBack, 1);

  const navigations = [];
  const reopened = {
    getParent: () => ({ navigate: (...args) => navigations.push(args) }),
  };
  assert.equal(retakeResult({ navigation: reopened, category: 'insect', fromIdentify: false }), true);
  assert.deepEqual(navigations.pop(), [
    'Insects',
    { screen: 'ScanHome', params: { category: 'insect' } },
  ]);
  assert.equal(retakeResult({ navigation: reopened, category: 'tree', fromIdentify: false }), true);
  assert.deepEqual(navigations.pop(), [
    'Plants',
    { screen: 'ScanHome', params: { category: 'tree' } },
  ]);
  assert.equal(retakeResult({ navigation: reopened, category: 'sound', fromIdentify: false }), true);
  assert.deepEqual(navigations.pop(), [
    'Sounds',
    { screen: 'SoundHome', params: { category: 'sound' } },
  ]);

  for (const file of uiLocaleFiles()) {
    const locale = JSON.parse(read(`public/locales/${file}`));
    const copy = locale.nextBestCapture.reasonIdentityUnresolved;
    assert.equal(typeof copy, 'string', file);
    assert.equal((copy.match(/\{\{name\}\}/g) || []).length, 1, file);
  }
});

test('risco grave chega ao recibo antes de qualquer recompensa visual', () => {
  const expected = {
    Plant: /riskLevel=\{plant\.toxicity \? 'danger' : null\}/,
    Tree: /riskLevel=\{plant\.toxicity \? 'danger' : null\}/,
    Crop: /riskLevel=\{\['high', 'severe'\]\.includes/,
    Mushroom: /riskLevel=\{edColor === colors\.error \|\| plant\.psychoactive === true \? 'danger' : null\}/,
    Insect: /riskLevel=\{dangerColor === colors\.error \? 'danger' : null\}/,
    Fish: /riskLevel=\{safetyRiskLevel\}/,
  };
  for (const [name, pattern] of Object.entries(expected)) {
    assert.match(read(`screens/${name}DetailScreen.js`), pattern, name);
  }
  assert.match(read('components/DiscoveryReceiptCard.js'), /shouldCelebrateDiscovery/);
});

test('ajustes permitem rever a introducao e controlar toque e movimento', () => {
  const source = read('screens/SettingsScreen.js');
  assert.match(source, /requestOnboardingReplay/);
  assert.match(source, /settings\.replayOnboarding/);
  assert.match(source, /setSensoryPreference\('hapticsEnabled'/);
  assert.match(source, /setSensoryPreference\('motionMode'/);
  assert.match(source, /updateDiscoveryPreferences/);
});

test('origem de aquisicao e opcional e so aparece depois do primeiro resultado seguro', () => {
  const source = read('components/DiscoveryReceiptCard.js');
  const prompt = read('components/AcquisitionSourceCard.js');
  assert.match(source, /<AcquisitionSourceCard visible=\{celebrate\}/);
  assert.match(prompt, /ACQUISITION_SOURCES\.map/);
  assert.match(prompt, /answer\('skipped'\)/);
  assert.doesNotMatch(prompt, /TextInput|email|username|handle/i);
});

test('home tem mascote animado sem virar video pesado', () => {
  const discover = read('screens/DiscoverScreen.js');
  const mascot = read('components/MascotWelcomeCard.js');
  const pt = JSON.parse(read('public/locales/pt.json'));
  const en = JSON.parse(read('public/locales/en.json'));

  assert.match(discover, /import MascotWelcomeCard/);
  assert.match(discover, /<MascotWelcomeCard \/>/);
  assert.match(mascot, /Animated\.loop/);
  assert.match(mascot, /useReducedMotion/);
  assert.match(mascot, /naturelens-mascot\.jpg/);
  assert.doesNotMatch(mascot, /Video|Lottie|setInterval/);
  assert.equal(pt.discover.mascot.title, 'Lino observa a natureza com voce.');
  assert.equal(en.discover.mascot.title, 'Lino explores nature with you.');
});
