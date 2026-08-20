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
  const locales = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !/-(herbs|species|manual)\.json$/.test(f));
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
  // to call stopAndAnalyse() directly and bypassed everything.
  assert.match(screen, /runExclusive\(stopAndAnalyse\)/);
  assert.match(screen, /toggle = \(\) =>\s*\n?\s*runExclusive/);
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
