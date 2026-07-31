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
    .filter((f) => f.endsWith('.json') && !/-(herbs|species)\.json$/.test(f));
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
