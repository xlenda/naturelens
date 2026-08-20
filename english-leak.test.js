// No English sentence may reach a user's screen.
//
// This has now been the same bug three separate times in one day:
//   * plants showed "The specified api key does not have sufficient number of
//     available credits." - the vendor's own sentence, in English, on the app's
//     flagship category;
//   * every fish and bird result carried "No description available for this
//     bird." in English, and it was SAVED into people's collections;
//   * the login screen - the one place someone gives up if they cannot read why
//     it failed - showed "Incorrect email or password" in English to all 17
//     languages.
//
// The rule the codebase now follows: the API answers with a `reason` CODE, and
// the client turns that code into a translated string. English text may still
// travel in `error` for logs and for anyone calling the API directly, but the
// client must never render it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

test('identification failures are reported with a code, not English prose', () => {
  const api = read('api/identify.js');
  assert.match(
    api,
    /reason: 'identifyFailed'/,
    'a 500 must carry a code the client can translate'
  );
  const client = read('components/identify.js');
  assert.match(
    client,
    /reason === 'identifyFailed'[\s\S]{0,120}identify\.identificationFailedDefault/,
    'the client must prefer the translated string over the server sentence'
  );
});

test('no English placeholder is ever stored as a species description', () => {
  // These were written into the entity and then persisted by saveToCollection,
  // so the English outlived the request and sat in the user's collection.
  const api = read('api/identify.js');
  assert.doesNotMatch(
    api,
    /overview:[^,\n]*'No description available/,
    'use null - the screens have this sentence translated in all 17 languages'
  );
});

test('every screen has a translated fallback for a missing description', () => {
  // Now that the API sends null, a screen rendering plant.overview raw would
  // show an empty card.
  for (const screen of [
    'screens/PlantDetailScreen.js',
    'screens/TreeDetailScreen.js',
    'screens/InsectDetailScreen.js',
    'screens/MushroomDetailScreen.js',
  ]) {
    const src = read(screen);
    assert.match(
      src,
      /\{plant\.overview \|\| t\(/,
      `${screen} renders plant.overview with no translated fallback`
    );
  }
});

test('auth failures are reported with a code, not English prose', () => {
  const api = read('api/auth.js');
  for (const reason of [
    'passwordTooShort',
    'subscribersOnly',
    'noSubscription',
    'linkFailed',
    'missingCredentials',
    'badCredentials',
    'googleFailed',
  ]) {
    assert.match(api, new RegExp(`reason: '${reason}'`), `api/auth.js never sends ${reason}`);
  }

  const client = read('components/restore.js');
  assert.match(client, /const REASON_KEYS = \{/);
  assert.doesNotMatch(
    client,
    /throw new Error\(data\?\.error/,
    'the client must translate the reason, never render the server sentence'
  );
});

test('every locale can phrase every auth failure', () => {
  const dir = path.join(__dirname, 'public', 'locales');
  const locales = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !/-(herbs|species|manual)\.json$/.test(f));
  assert.equal(locales.length, 17);

  for (const file of locales) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const key of [
      'passwordTooShort',
      'subscribersOnly',
      'noSubscription',
      'linkFailed',
      'missingCredentials',
      'badCredentials',
      'googleFailed',
    ]) {
      assert.ok(
        typeof json.authError?.[key] === 'string' && json.authError[key].trim(),
        `${file} is missing a non-empty authError.${key}`
      );
    }
  }
});

test('no screen renders a server error message directly', () => {
  // `err.message` is safe now only because every throw site builds it from a
  // translated key. A screen reaching into a response body for prose would
  // reintroduce the whole class of bug.
  const screens = fs
    .readdirSync(path.join(__dirname, 'screens'))
    .filter((f) => f.endsWith('.js'));

  for (const file of screens) {
    const src = read(path.join('screens', file));
    assert.doesNotMatch(
      src,
      /\bdata\?\.error\b|\bdata\.error\b/,
      `screens/${file} reads an error string out of a response - translate a reason code instead`
    );
  }
});

test('the Translate button is never offered on already-translated text', () => {
  // The first version keyed the button off the Wikipedia language flag and
  // attached it to whatever text was leading. When the vendor's description had
  // been translated server-side into Portuguese but Wikipedia had only an
  // English article, a Portuguese paragraph still showed "Traduzir" - a button
  // that would spend an API call to turn Portuguese into Portuguese.
  const src = read('screens/FishDetailScreen.js');
  assert.match(src, /const stillEnglish = \(text\) =>/);
  assert.match(
    src,
    /showWhenEnglish=\{stillEnglish\(lead\)\}/,
    'the lead must be judged by which source it came from, not by the wiki flag'
  );
  assert.match(src, /showWhenEnglish=\{stillEnglish\(secondary\)\}/);
  assert.doesNotMatch(
    src,
    /showWhenEnglish=\{!localised\?\.localised\}/,
    'that condition ignores which text is actually on screen'
  );
});

test('a translated vendor description is recognisable as translated', () => {
  // stillEnglish() leans on overviewOriginal being populated only when a
  // translation actually happened. If the API ever set it unconditionally the
  // button would disappear from text that is still English.
  const api = read('api/identify.js');
  assert.match(
    api,
    /overviewOriginal: translated \? fa\.description : null/,
    'overviewOriginal must be null when no translation happened - the client ' +
      'uses its presence to know the overview is in the reader language'
  );
});

test('no screen offers Translate without checking the text language', () => {
  // Three screens carry the button and each judges "is this still English?"
  // differently, because each gets its text from a different place. The bug this
  // catches is the lazy version: offering whenever text merely EXISTS.
  const cases = [
    ['screens/FishDetailScreen.js', /showWhenEnglish=\{stillEnglish\(/],
    ['screens/BirdDetailScreen.js', /showWhenEnglish=\{[^}]*!localised\?\.localised/],
    ['screens/SoundDetailScreen.js', /!isInReaderLanguage\(info\.extract, i18n\.language\)/],
  ];
  for (const [file, pattern] of cases) {
    assert.match(
      read(file),
      pattern,
      `${file} must decide the Translate button from the text's language, not its existence`
    );
  }
});

test('a translation never outlives the text it was made from', () => {
  // `text` is not fixed for the life of TranslatableText: FishDetailScreen picks
  // which source leads, and that flips the moment the Wikipedia lookup resolves.
  // Tap Translate on the vendor's table while the lookup is in flight and, a
  // second later, the component was still rendering the old translation over the
  // new paragraph.
  const src = read('components/TranslatableText.js');

  // Cleared when the text or the language changes.
  assert.match(src, /useEffect\(\(\) => \{\s*setTranslated\(null\);[\s\S]{0,60}\}, \[text\]\)/);
  assert.match(src, /\}, \[i18n\.language\]\)/);

  // And a request already in flight must not land on the new text.
  assert.match(src, /const requestedText = text;/);
  assert.match(
    src,
    /currentRef\.current\.text !== requestedText[\s\S]{0,30}return;/,
    'a late answer for a paragraph no longer on screen must be discarded'
  );
  assert.match(src, /const currentRef = useRef\(/, 'must be a ref - state would be stale in the callback');
});

test('the Hotmart-unlock flow explains what actually failed', () => {
  // verify-code.js and request-code.js sent no reason at all, so a wrong code,
  // an unknown email and a failed device link all rendered as the same
  // "Something went wrong. Please try again." - in the flow someone uses
  // precisely because something already went wrong with their purchase.
  const verify = read('api/restore/verify-code.js');
  const request = read('api/restore/request-code.js');
  assert.match(verify, /reason: 'badCode'/);
  assert.match(verify, /reason: 'noSubscription'/);
  assert.match(verify, /reason: 'linkFailed'/);
  assert.match(request, /reason: 'badEmail'/);

  const client = read('components/restore.js');
  for (const reason of ['badCode', 'badEmail', 'codeSendFailed', 'accountExists', 'signupFailed']) {
    assert.match(client, new RegExp(`${reason}: 'authError\.`), `${reason} is not mapped to a key`);
  }
});

test('creating a password twice does not report a false success', () => {
  // Supabase deliberately does NOT error when the email already has an account -
  // it answers 200 with an empty `identities` array, so a signup form cannot be
  // used to discover which addresses are registered. Forwarded as-is, that told
  // a subscriber "password created" while their real password was unchanged,
  // and they could then never sign in.
  const api = read('api/auth.js');
  assert.match(api, /signUpData\?\.user\?\.identities/);
  assert.match(api, /reason: 'accountExists'/);
});

test('the delete-account dialogs do not promise a cancellation that never happens', () => {
  // handleDelete deliberately does not cancel Hotmart billing - deleting data
  // while a card keeps being charged, silently, is the dark pattern it avoids.
  // The copy said the opposite.
  const api = read('api/auth.js');
  assert.doesNotMatch(
    api.slice(api.indexOf('async function handleDelete')),
    /cancel.*subscription.*await/i,
    'if this ever starts cancelling, the copy below has to change with it'
  );

  const dir = path.join(__dirname, 'public', 'locales');
  const claims = /cancel(a|s|ed|led|a sua|ada)?\b(?![^.]*\bnão\b)/i;
  const pt = JSON.parse(fs.readFileSync(path.join(dir, 'pt.json'), 'utf8'));
  assert.doesNotMatch(
    pt.profile.deleteAccountDoneBody,
    /foi cancelada/i,
    'the success message must not claim the subscription was cancelled'
  );
  assert.match(
    pt.profile.deleteAccountConfirmBody,
    /NÃO cancela/,
    'the confirmation must warn that billing continues'
  );
});

test('location never stalls a scan more than once', () => {
  // A device that cannot produce a fix - indoors, no GPS, a desktop browser -
  // paid the full guard timeout on EVERY identification, forever.
  const src = read('components/deviceLocation.js');
  assert.match(src, /let lastFailureAt = 0;/);
  assert.match(src, /Date\.now\(\) - lastFailureAt < FAILURE_BACKOFF_MS[\s\S]{0,20}return null/);
  // And a refusal is a timestamp, not a permanent flag: browsers report a
  // dismissed prompt with the same code as a deliberate block, so a stray tap
  // used to kill the feature for good with no way back.
  assert.match(src, /DENIED_RETRY_MS/);
  assert.match(src, /setItem\(DENIED_KEY, String\(Date\.now\(\)\)\)/);
});

test('no user-visible English is built inside components/', () => {
  // The gap that shipped 'Water today' / 'Water in 5d' to all 17 languages:
  // this file only ever scanned screens/, so a label assembled in a component
  // was invisible to the gate. Rendering text is UI, and UI text is t().
  const dir = path.join(__dirname, 'components');
  const suspicious =
    /(?:label|title|message|text)\s*:\s*(?:`|')(?:[A-Z][a-z]+ )(?:[a-z]|\$\{)/;
  const offenders = [];
  // legalTexts.js is a DATA module of the full bilingual legal documents, and
  // ErrorBoundary ships its own three-language copy because it renders when
  // i18n itself may have failed to load. Both are deliberate.
  const EXEMPT = new Set(['legalTexts.js', 'ErrorBoundary.js']);
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js') || EXEMPT.has(file)) continue;
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const line of src.split('\n')) {
      // Comments and dataLayer event names are not user-visible.
      if (/^\s*(\/\/|\*)/.test(line) || /event\s*:/.test(line)) continue;
      if (suspicious.test(line)) offenders.push(`${file}: ${line.trim().slice(0, 70)}`);
    }
  }
  assert.deepEqual(offenders, [], 'build user text with t(), not string literals');
});
