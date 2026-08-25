// Guards on the sound-identification path.
//
// These exist because every one of them is a rule that was WRONG in a first
// version and only showed up against a real recording:
//
//  * the classifier head was selected by tensor shape, which silently picked
//    `embedding` (1536 wide) instead of `label` (14795) and returned a flat
//    0.1% across meaningless classes;
//  * confidence came from a plain sigmoid on multi-label logits, so the top five
//    species all read "100.0%";
//  * 198 of Perch's classes are FSD50K sound EVENTS ("Car", "Applause",
//    "Speech") and were presented as species;
//  * white noise scores 7.5 for Coturnix coturnix, so "the model returned
//    something" is not the same as "there is an animal here".
//
// The numbers below are measured, not assumed - see docs/perch-host/bench.py and
// the constant block in docs/perch-host/app.py.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { uiLocaleFiles } = require('./test-locales');
const { WAVEFORM_PEAK_COUNT, buildWaveformPeaks } = require('./components/audioWaveform');
const {
  TARGET_SAMPLE_RATE,
  pcm16Base64ToFloat32,
  resampleBandLimited,
  resampleLinear,
  float32ToBase64,
} = require('./components/audioPcm');
const { fromByteArray, toByteArray } = require('base64-js');

const identifySrc = fs.readFileSync(path.join(__dirname, 'api/identify.js'), 'utf8');
const perchSrc = fs.readFileSync(path.join(__dirname, 'api/_lib/perch.js'), 'utf8');
const hostSrc = fs.readFileSync(path.join(__dirname, 'docs/perch-host/app.py'), 'utf8');

// Isolates the `sound:` handler so a rule proven here cannot be satisfied by an
// unrelated category elsewhere in the file.
function soundHandler() {
  const start = identifySrc.indexOf('\n  sound: {');
  assert.ok(start > 0, 'api/identify.js has no sound handler');
  const end = identifySrc.indexOf('\n  },', start);
  return identifySrc.slice(start, end);
}

test('a low-confidence result is refused instead of naming a species', () => {
  // Deliberately `!== true` rather than `=== false`: see the dedicated test for
  // why an absent flag must not read as confident. White noise alone scores 7.5
  // on this model, so "the host answered" is not "there is an animal here".
  assert.match(
    soundHandler(),
    /data\.confident !== true[\s\S]{0,60}notFound: true/,
    'the sound handler must reject unless the host affirmatively reports confidence'
  );
});

test('FSD50K sound events are never presented as wildlife', () => {
  const handler = soundHandler();
  assert.match(
    handler,
    /group === 'noise'[\s\S]{0,80}notFound: true/,
    'a "Car" or "Applause" class must be refused, not shown as a species'
  );
  assert.match(
    handler,
    /reason: 'notWildlife'/,
    'the refusal needs its own reason so the app can say what actually happened'
  );
});

test('a noise class can never appear as a runner-up either', () => {
  const start = identifySrc.indexOf('function mapSoundAlternatives');
  assert.ok(start > 0, 'mapSoundAlternatives is missing');
  const fn = identifySrc.slice(start, identifySrc.indexOf('\n}', start));
  assert.match(fn, /group !== 'noise'/, 'alternatives must filter out noise classes');
  assert.match(
    fn,
    /\(p\.score \|\| 0\) > 0/,
    'an alternative scoring zero is below the noise floor and is not a candidate'
  );
});

test('the overview is not a hardcoded English string', () => {
  // It shipped as "No description available for this recording." at one point,
  // which would have appeared in English in all 17 locales.
  assert.doesNotMatch(
    soundHandler(),
    /overview: '[A-Za-z]/,
    'overview must come from the client (Wikipedia in the user language), not a literal'
  );
});

test('both refusal reasons have a translated message in every locale', () => {
  const dir = path.join(__dirname, 'public/locales');
  const locales = uiLocaleFiles();
  assert.ok(locales.length === 17, `expected 17 UI locales, found ${locales.length}`);
  for (const file of locales) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const key of ['notFoundBody', 'notWildlifeBody']) {
      assert.ok(
        typeof j.sound?.[key] === 'string' && j.sound[key].trim(),
        `${file} is missing a non-empty sound.${key}`
      );
    }
  }
});

test('the client picks the message that matches the reason', () => {
  const clientSrc = fs.readFileSync(path.join(__dirname, 'components/identify.js'), 'utf8');
  assert.match(
    clientSrc,
    /reason === 'notWildlife'[\s\S]{0,120}sound\.notWildlifeBody/,
    'telling someone to get closer to a passing bus is useless advice'
  );
});

// --- the inference host's own contract -------------------------------------

test('the host selects the classifier head by NAME, not by shape', () => {
  assert.match(
    hostSrc,
    /LOGITS_OUTPUT = "label"/,
    'the output must be chosen by name: picking the first 2-D output wider than ' +
      '1000 columns silently returns `embedding` (1536)'
  );
  assert.doesNotMatch(
    hostSrc,
    /shape\[1\] > 1000/,
    'the shape-based heuristic is the bug this test exists for'
  );
});

test('confidence is calibrated against a measured noise floor, not a raw sigmoid', () => {
  assert.match(hostSrc, /NOISE_FLOOR = 8\.0/, 'noise floor must stay above the measured 7.5');
  assert.match(hostSrc, /CONFIDENT_AT = 15\.0/);
  assert.match(hostSrc, /MIN_ACCEPT_LOGIT = 8\.5/);
  // A softmax over 14,795 multi-label logits drags every score towards zero.
  assert.doesNotMatch(
    hostSrc,
    /probs \/= probs\.sum\(\)/,
    'softmax over the full class list is wrong for a multi-label head'
  );
});

test('the host refuses audio at the wrong sample rate rather than guessing', () => {
  assert.match(hostSrc, /sample_rate must be \{SAMPLE_RATE\}/);
  assert.match(hostSrc, /SAMPLE_RATE = 32000/);
});

test('the whole recording is analysed, not just a centre crop', () => {
  assert.match(hostSrc, /def _windows/, 'recordings longer than 5s must be windowed');
  assert.match(
    hostSrc,
    /logits\.max\(axis=0\)/,
    'a call heard clearly in one window must not be averaged down by silence'
  );
  assert.match(hostSrc, /MAX_WINDOWS = 6/, 'an oversized upload must not become an unbounded batch');
});

test('a label list of the wrong width is discarded instead of mislabelling species', () => {
  // The CSVs come from a different repo than the weights, so a width mismatch
  // must disable them rather than rename every species to its alphabetical
  // neighbour. The discard is also LOGGED and latched: silently degrading is how
  // this class of bug survives, and retrying a load that will fail identically
  // just burns Hub requests.
  assert.match(
    hostSrc,
    /len\(_labels\) != logits\.shape\[-1\][\s\S]{0,400}_labels = None[\s\S]{0,40}_labels_failed = True/,
    'a width mismatch must discard the labels, log it, and not retry forever'
  );
});

// --- the nine defects found by adversarial review on 2026-07-30 ---------------
//
// Each of these shipped, was confirmed by two independent skeptics, and is fixed.
// The tests are here so the fix cannot be undone by a later edit that looks
// harmless.

test('Permissions-Policy allows the microphone the app asks for', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
  const header = vercel.headers
    ?.flatMap((h) => h.headers || [])
    .find((h) => h.key === 'Permissions-Policy');
  assert.ok(header, 'the Permissions-Policy header is gone');
  // microphone=() is an EMPTY allowlist: it denies the feature to everyone
  // INCLUDING this site, getUserMedia rejects before any prompt, and nothing in
  // the page can override it. This exact value shipped the whole sound category
  // stone dead while every other check passed.
  assert.doesNotMatch(
    header.value,
    /microphone\s*=\s*\(\s*\)/,
    'microphone=() denies the microphone to this site - the sound category cannot record'
  );
  assert.match(header.value, /microphone\s*=\s*\(\s*self\s*\)|microphone\s*=\s*\*/);
});

test('an absent confidence flag is not treated as confident', () => {
  // `=== false` would let a rolled-back host that omits the field skip the guard
  // and pass every noise recording through as a species.
  assert.match(
    soundHandler(),
    /data\.confident !== true/,
    'absence of evidence of confidence is not confidence'
  );
});

test('a raw class index is never presented as a species', () => {
  // The host answers with the class index ("4821") when its label CSVs failed to
  // load. Accepted, that renders a card titled "4821" and looks "4821" up on
  // Wikipedia.
  assert.match(
    soundHandler(),
    /\/\^\\d\+\$\/\.test\(String\(top\.label\)/,
    'an all-digits label means the host lost its labels and must be refused'
  );
});

test('a notFound result does not spend a free use', () => {
  const src = fs.readFileSync(path.join(__dirname, 'api/identify.js'), 'utf8');
  assert.match(
    src,
    /!entitlement\.subscribed && !result\.notFound/,
    'charging for "nothing found" spends someone\'s only free scan on a silent ' +
      'recording, and the retry that would have worked hits the paywall'
  );
});

test('audio length is capped before it is forwarded to the owner VPS', () => {
  assert.match(perchSrc, /MAX_AUDIO_SECONDS = 12/);
  assert.match(perchSrc, /MAX_AUDIO_BASE64_CHARS/);
  assert.match(
    perchSrc,
    /audio\.length > MAX_AUDIO_BASE64_CHARS[\s\S]{0,220}status\(413\)/,
    'a 4.4 MB payload is ~34s of audio = 7 inferences per request against a ' +
      '2-core box that also runs production'
  );
  // The host has to enforce it independently - Vercel is not the only caller.
  assert.match(hostSrc, /status_code=413/);
});

test('the recorder never leaves the microphone open', () => {
  const rec = fs.readFileSync(path.join(__dirname, 'components/audioRecorder.js'), 'utf8');
  // The auto-stop timeout is the last line of defence for an ORPHANED handle -
  // one whose owner lost its reference - so it must release the device, not just
  // stop the recorder.
  const autoStop = rec.slice(rec.indexOf('const autoStop'), rec.indexOf('const releaseMic'));
  assert.match(
    autoStop,
    /stream\.getTracks\(\)\.forEach/,
    'the auto-stop must release the mic: an orphaned handle has nobody left to ' +
      'call cancel() on, and the browser recording indicator stays lit'
  );
  // A MediaRecorder constructor that throws must not leak the already-open stream.
  assert.match(
    rec,
    /new MediaRecorder[\s\S]{0,200}catch[\s\S]{0,160}getTracks\(\)\.forEach/,
    'if MediaRecorder construction fails the stream is already open and must be stopped'
  );
});

test('a double-tap cannot start two recordings', () => {
  const screen = fs.readFileSync(path.join(__dirname, 'screens/SoundScreen.js'), 'utf8');
  assert.match(screen, /busyRef = useRef\(false\)/, 'a ref, not state: a double-tap lands in one React batch');
  assert.match(screen, /const runExclusive/);
  // Both entry points must go through the guard - the interval's auto-stop used
  // to bypass the exclusive transition and could submit twice.
  assert.match(screen, /runExclusive\(stopAndPrepare\)/);
  assert.match(screen, /toggle = \(\) =>\s*\n?\s*runExclusive/);
});

test('sound waits for Pulso Vivo before uploading and discards an abandoned clip', () => {
  const screen = fs.readFileSync(path.join(__dirname, 'screens/SoundScreen.js'), 'utf8');
  const prepareStart = screen.indexOf('const stopAndPrepare =');
  const revealStart = screen.indexOf('const revealPendingClip =');
  const prepare = screen.slice(prepareStart, revealStart);
  const reveal = screen.slice(revealStart, screen.indexOf('const toggle =', revealStart));

  assert.ok(prepareStart >= 0 && revealStart > prepareStart);
  assert.match(prepare, /pendingClipRef\.current = clip/);
  assert.doesNotMatch(prepare, /await analyse\(clip\)|identifySound/,
    'parar a gravacao ainda nao pode enviar o audio');
  assert.match(reveal, /pendingClipRef\.current/);
  assert.match(reveal, /await analyse\(clip\)/);
  assert.match(screen, /<LensPulseButton[\s\S]*onComplete=\{revealPendingClip\}/);
  assert.match(screen, /t\('sound\.uploadDisclosure'\)/);
  assert.match(screen, /cancelActiveRecording[\s\S]*pendingClipRef\.current = null/,
    'sair da tela ou mandar o app ao fundo precisa descartar o audio pendente');

  for (const code of ['ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pl', 'pt', 'sv', 'tr', 'zh', 'zh-hant']) {
    const locale = JSON.parse(fs.readFileSync(path.join(__dirname, `public/locales/${code}.json`), 'utf8'));
    assert.ok(locale.sound.uploadDisclosure?.trim(), `${code}: divulgacao de envio do audio`);
  }
});

test('leaving during the native permission prompt cancels the late recorder', () => {
  const screen = fs.readFileSync(path.join(__dirname, 'screens/SoundScreen.js'), 'utf8');
  assert.match(screen, /mountedRef = useRef\(true\)/);
  assert.match(screen, /mountedRef\.current = false/);
  assert.match(
    screen,
    /const handle = await startRecording\(\);[\s\S]{0,300}!mountedRef\.current[\s\S]{0,120}handle\.cancel\(\)/,
    'a permission prompt can resolve after unmount, when the ordinary cleanup has no handle yet'
  );
});

test('recording is cancelled when the sound screen blurs or the app leaves foreground', () => {
  const screen = fs.readFileSync(path.join(__dirname, 'screens/SoundScreen.js'), 'utf8');
  assert.match(screen, /AppState\.addEventListener\('change'/);
  assert.match(
    screen,
    /nextState === 'active'[\s\S]{0,120}cancelActiveRecording\(\)/,
    'Home, lock screen and app switching must release the microphone'
  );
  assert.match(
    screen,
    /navigation\.addListener\('blur',[\s\S]{0,160}cancelActiveRecording\(\)/,
    'changing tabs must release the microphone even when React keeps the screen mounted'
  );
  assert.match(
    screen,
    /!screenFocusedRef\.current \|\| !appActiveRef\.current[\s\S]{0,100}handle\.cancel\(\)/,
    'a late permission result must not reopen the microphone off-screen'
  );
});

test('microphone errors give Android instructions in the APK and browser instructions on web', () => {
  const screen = fs.readFileSync(path.join(__dirname, 'screens/SoundScreen.js'), 'utf8');
  for (const key of [
    'permissionAndroidBody',
    'permissionWebBody',
    'unsupportedAndroidBody',
    'unsupportedWebBody',
    'unsupportedIosBody',
  ]) {
    assert.match(screen, new RegExp(`sound\\.${key}`));
  }
  assert.doesNotMatch(screen, /t\('sound\.(?:permissionBody|unsupportedBody)'\)/);
});

test('saving waits for the species lookup to settle', () => {
  const screen = fs.readFileSync(path.join(__dirname, 'screens/SoundDetailScreen.js'), 'utf8');
  assert.match(screen, /lookupDone/, 'this screen has no user photo - name, text and image all come from one request');
  assert.match(screen, /saveDisabled = !saved && !lookupDone/);
  // .finally, not .then: a species Wikipedia does not have must not disable the
  // button forever.
  assert.match(screen, /\.finally\(\(\) => \{\s*\n?\s*if \(alive\) setLookupDone\(true\)/);
});

test('the host publishes labels before the session and can retry a failed load', () => {
  // Publishing _session first let a concurrent cold-start request read a
  // still-None _labels and answer with a class index; a failed load then latched
  // forever because the fast path short-circuited on _session alone.
  assert.match(hostSrc, /_labels_failed/, 'a failed label load must be retryable');
  assert.match(
    hostSrc,
    /_session is not None and \(_labels is not None or _labels_failed\)/,
    'the fast path must require labels, not just a session'
  );
  const body = hostSrc.slice(hostSrc.indexOf('def _get_session'), hostSrc.indexOf('class Request'));
  assert.ok(
    body.indexOf('_labels = labels') < body.indexOf('_session = session'),
    'labels must be published BEFORE the session so no reader sees one without the other'
  );
});

test('inference concurrency is bounded on a 2-core shared box', () => {
  // FastAPI runs a non-async def in Starlette's 40-slot threadpool. Nothing
  // stopped 40 simultaneous ONNX runs on a box that also serves the owner's
  // production dashboard.
  assert.match(hostSrc, /_inference_slot = threading\.BoundedSemaphore\(1\)/);
  assert.match(
    hostSrc,
    /_inference_slot\.acquire\(timeout=INFERENCE_WAIT_SECONDS\)[\s\S]{0,120}status_code=503/,
    'the wait must be bounded, or a burst blocks every threadpool slot including /health'
  );
  assert.match(hostSrc, /finally:\s*\n\s*_inference_slot\.release\(\)/);
});

test('non-finite audio samples are refused', () => {
  // A clip of NaN sails through the model and comes out as garbage logits that
  // _calibrate() turns into a confident-looking score.
  assert.match(hostSrc, /np\.all\(np\.isfinite\(samples\)\)/);
});

test('the endpoint stays disabled until a host is configured', () => {
  assert.match(
    identifySrc,
    /category === 'sound'[\s\S]{0,80}PERCH_ENDPOINT/,
    'with no PERCH_ENDPOINT the category must report itself unavailable'
  );
  assert.match(perchSrc, /PERCH_AUTH_TOKEN/, 'the host must be protected by a bearer token');
});

test('Android exposes the PCM recorder and requests only foreground microphone permission', () => {
  const categories = fs.readFileSync(path.join(__dirname, 'components/categories.js'), 'utf8');
  assert.match(
    categories,
    /sound:\s*\{[\s\S]*?enabled: Platform\.OS === 'web' \|\| Platform\.OS === 'android'/,
    'sound identification must be visible on Android and web'
  );

  const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8'));
  const imagePicker = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker'
  );
  assert.match(imagePicker?.[1]?.microphonePermission, /NatureLens/);
  const audioPlugin = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === '@siteed/audio-studio'
  );
  assert.ok(audioPlugin, 'the Android PCM recorder needs its native config plugin');
  assert.deepEqual(audioPlugin[1], {
    enablePhoneStateHandling: false,
    enableNotifications: false,
    enableBackgroundAudio: false,
    enableDeviceDetection: false,
  });

  const native = fs.readFileSync(path.join(__dirname, 'components/audioRecorder.android.js'), 'utf8');
  assert.match(native, /sampleRate: NATIVE_SAMPLE_RATE/);
  assert.match(native, /channels: 1/);
  assert.match(native, /encoding: 'pcm_16bit'/);
  assert.match(native, /requestPermissionsAsync/);
  assert.match(native, /deleteTemporaryFile\(uri\)/, 'temporary raw audio must be deleted after use');
});

test('Android PCM is decoded little-endian and resampled to Perch 32 kHz without changing time', () => {
  const pcm = new Int16Array([0, 16384, -16384, 32767, -32768, 8192]);
  const base64 = fromByteArray(new Uint8Array(pcm.buffer));
  const decoded = pcm16Base64ToFloat32(base64);
  assert.equal(decoded.length, pcm.length);
  assert.equal(decoded[0], 0);
  assert.equal(decoded[1], 0.5);
  assert.equal(decoded[2], -0.5);
  assert.equal(decoded[4], -1);

  const oneSecond = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i / 50));
  const resampled = resampleLinear(oneSecond, 48000, TARGET_SAMPLE_RATE);
  assert.equal(resampled.length, 32000);
  assert.ok(resampled.every(Number.isFinite));
  assert.ok(resampled.every((sample) => sample >= -1 && sample <= 1));

  const roundTrip = new Float32Array(toByteArray(float32ToBase64(resampled)).buffer);
  assert.deepEqual(roundTrip, resampled);
});

test('native Android downsampling removes ultrasonic aliases before Perch', () => {
  const tone = (frequency) => Float32Array.from(
    { length: 48000 },
    (_, index) => Math.sin((2 * Math.PI * frequency * index) / 48000)
  );
  const rms = (samples) => Math.sqrt(
    samples.reduce((sum, value) => sum + value * value, 0) / samples.length
  );
  const passBand = resampleBandLimited(tone(1000), 48000, TARGET_SAMPLE_RATE);
  const aboveNewNyquist = resampleBandLimited(tone(20000), 48000, TARGET_SAMPLE_RATE);

  assert.ok(rms(passBand) > 0.65, 'a real call-band tone must survive');
  assert.ok(rms(aboveNewNyquist) < 0.02, '20 kHz must not fold into a false 12 kHz cue');
  const pcmSource = fs.readFileSync(path.join(__dirname, 'components/audioPcm.js'), 'utf8');
  assert.match(pcmSource, /const samples = resampleBandLimited\(decoded/);
});

test('native profile hides unavailable categories unless an old record still needs them', () => {
  const profile = fs.readFileSync(path.join(__dirname, 'screens/ProfileScreen.js'), 'utf8');
  assert.match(
    profile,
    /filter\(\(meta\) => meta\.enabled !== false \|\| counts\[meta\.key\] > 0\)/,
    'a zero-count native row must not advertise a scanner that cannot open'
  );
});

// --- evidence from the user's recording -----------------------------------

test('waveform peaks come from the decoded samples and stay compact and normalised', () => {
  const samples = new Float32Array(400);
  samples[5] = -1;
  samples[205] = 0.5;

  const peaks = buildWaveformPeaks(samples);
  assert.equal(peaks.length, WAVEFORM_PEAK_COUNT);
  assert.equal(peaks[0], 1, 'absolute amplitude, including negative samples, must drive the peak');
  assert.equal(peaks[20], 0.5);
  assert.ok(peaks.every((peak) => Number.isFinite(peak) && peak >= 0 && peak <= 1));

  const changed = Float32Array.from(samples);
  changed[5] = 0;
  changed[155] = 1;
  assert.notDeepEqual(
    buildWaveformPeaks(changed),
    peaks,
    'changing the real recording must change the evidence; fixed decorative bars would fail this'
  );

  assert.equal(buildWaveformPeaks(samples, 1).length, 32);
  assert.equal(buildWaveformPeaks(samples, 100).length, 48);
  assert.deepEqual(buildWaveformPeaks(new Float32Array(400)), Array(40).fill(0));
});

test('the decoded clip carries peaks and duration, but the detail route never carries audio bytes', () => {
  const recorder = fs.readFileSync(path.join(__dirname, 'components/audioRecorder.js'), 'utf8');
  const screen = fs.readFileSync(path.join(__dirname, 'screens/SoundScreen.js'), 'utf8');

  assert.match(recorder, /waveform:\s*buildWaveformPeaks\(samples\)/);
  assert.match(recorder, /durationSeconds,/);

  const routeStart = screen.indexOf("navigation.navigate('SoundDetail'");
  const routeEnd = screen.indexOf('});', routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, 'SoundDetail navigation payload is missing');
  const routePayload = screen.slice(routeStart, routeEnd);

  assert.match(routePayload, /waveform:\s*clip\.waveform/);
  assert.match(routePayload, /durationSeconds:\s*clip\.durationSeconds/);
  assert.doesNotMatch(routePayload, /base64|sampleRate|audio\s*:/, 'navigation state must not carry audio bytes');
});

test('audio evidence leads the sound result and never leaks into collection storage', () => {
  const detail = fs.readFileSync(path.join(__dirname, 'screens/SoundDetailScreen.js'), 'utf8');
  const scroll = detail.indexOf('<ScrollView');
  const evidence = detail.indexOf('<AudioEvidenceCard', scroll);
  const photo = detail.indexOf('{photo ?', scroll);
  const identity = detail.indexOf('<View style={styles.nameRow}', scroll);

  assert.ok(scroll >= 0 && evidence > scroll, 'AudioEvidenceCard must be in the result scroll');
  assert.ok(evidence < photo, 'the user recording must be distinguished before the reference photo');
  assert.ok(evidence < identity, 'the evidence must precede the inferred species identity');
  assert.match(detail, /\{ plant, fromIdentify, waveform, durationSeconds, scanOutcome, scanOutcomeRequest \} = route\.params/);

  const saveStart = detail.indexOf('const toggleSave =');
  const saveEnd = detail.indexOf('const groupLabelKey', saveStart);
  const saveFlow = detail.slice(saveStart, saveEnd);
  assert.doesNotMatch(
    saveFlow,
    /base64|waveform|durationSeconds/,
    'collection entries must stay free of the clip and its transient route evidence'
  );
});

test('the evidence card is descriptive and accessible, not fake playback', () => {
  const card = fs.readFileSync(path.join(__dirname, 'components/AudioEvidenceCard.js'), 'utf8');

  assert.match(card, /peaks\.length < 32/);
  assert.match(card, /peaks\.length > 48/);
  assert.match(card, /accessibilityLabel=\{t\('sound\.audioEvidenceAlt', \{ seconds \}\)\}/);
  assert.match(card, /sound\.audioEvidenceTitle/);
  assert.match(card, /sound\.audioEvidenceBody/);
  assert.doesNotMatch(card, /Touchable|onPress|play(?:back)?|spectrogram/i);
});

test("all 17 locales distinguish the user's recording and preserve duration interpolation", () => {
  const dir = path.join(__dirname, 'public/locales');
  const locales = uiLocaleFiles();
  assert.equal(locales.length, 17);

  for (const file of locales) {
    const sound = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).sound;
    for (const key of ['audioEvidenceTitle', 'audioEvidenceBody']) {
      assert.ok(typeof sound?.[key] === 'string' && sound[key].trim(), `${file}: sound.${key} is missing`);
    }
    for (const key of ['audioEvidenceDuration', 'audioEvidenceAlt']) {
      assert.ok(
        typeof sound?.[key] === 'string' && sound[key].includes('{{seconds}}'),
        `${file}: sound.${key} must preserve {{seconds}}`
      );
    }
  }
});

test('sound topics disappear when a saved result has no recording evidence or real detail', () => {
  const detail = fs.readFileSync(path.join(__dirname, 'screens/SoundDetailScreen.js'), 'utf8');
  const helperSource = detail.match(/function hasUsableAudioEvidence[\s\S]*?\n}/)?.[0];
  assert.ok(helperSource, 'the audio evidence validator is missing');
  const hasUsableAudioEvidence = new Function(
    `${helperSource}; return hasUsableAudioEvidence;`
  )();

  assert.equal(hasUsableAudioEvidence(undefined, undefined), false);
  assert.equal(hasUsableAudioEvidence(undefined, 4.2), false, 'duration alone is not a retained recording');
  assert.equal(hasUsableAudioEvidence(Array(31).fill(0.5), 4.2), false);
  assert.equal(hasUsableAudioEvidence([...Array(31).fill(0.5), 2], 4.2), false);
  assert.equal(hasUsableAudioEvidence(Array(32).fill(0.5), 4.2), true);

  assert.match(detail, /const evidenceLines = hasAudioEvidence\s*\?/);
  assert.match(detail, /const baseTopics = buildSoundTopics\(\{/);
  assert.match(detail, /evidenceLines,/);
  assert.match(
    detail,
    /\{ label: t\('categories\.sound\.label'\), value: groupLabelKey \? groupLabel : null \}/,
    'an absent provider group must not become a generic sound fact'
  );
  assert.match(detail, /const readingTopics = topics\.filter\(\(topic\) => topic\.key !== 'evidence'\)/);
  assert.match(detail, /\{readingTopics\.length > 0 && \(/);
  assert.doesNotMatch(detail, /\{topics\.length > 0 && \(/);
});

test('the short Wikipedia description fails closed when it is not in the reader language', () => {
  const detail = fs.readFileSync(path.join(__dirname, 'screens/SoundDetailScreen.js'), 'utf8');
  const guard = detail.indexOf('!!info?.description && isInReaderLanguage(info.description, i18n.language)');
  const rendered = detail.indexOf(
    '<Text style={styles.taxonLine}>{info.description}</Text>',
    guard
  );

  assert.ok(guard >= 0, 'the reader-language guard is missing');
  assert.ok(rendered > guard && rendered - guard < 180, 'description escaped its language guard');
});
