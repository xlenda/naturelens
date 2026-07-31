// Key-parity gate across all 17 locales.
//
// Ported from the Cosmic Guide base kit and adapted: that app kept its
// dictionaries as JS objects, this one ships them as JSON under public/locales
// and lazy-fetches one at runtime. Same purpose either way - without this test,
// a key added to en.json and forgotten in the other 16 falls back silently to
// English, and nobody notices until a Turkish user sees an English sentence in
// the middle of a screen.
//
// It also checks i18next interpolation placeholders survive translation, which
// is a real failure mode here: a translator (human or model) that "translates"
// {{count}} or {{name}} breaks the string at runtime rather than at build time.
//
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LOCALES_DIR = path.join(__dirname, 'public', 'locales');
const REFERENCE = 'en';

// Content files that live alongside the UI locales but are NOT UI locales:
// they hold heavy per-species prose loaded on demand, and comparing them
// against en.json for key parity is meaningless. Listed explicitly so adding a
// third content family forces a conscious update here rather than silently
// breaking the parity tests (which is exactly what happened when -species was
// added and only -herbs was excluded).
const CONTENT_SUFFIXES = ['herbs', 'species'];

function localeFiles(suffix) {
  return fs
    .readdirSync(LOCALES_DIR)
    .filter((f) => f.endsWith('.json'))
    .filter((f) =>
      suffix
        ? f.endsWith(`-${suffix}.json`)
        : !CONTENT_SUFFIXES.some((s) => f.endsWith(`-${s}.json`))
    )
    .map((f) => ({
      lang: suffix ? f.replace(`-${suffix}.json`, '') : f.replace('.json', ''),
      file: path.join(LOCALES_DIR, f),
    }));
}

function load(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Flattens { a: { b: "x" } } to ["a.b"] so nested namespaces are compared too -
// a shallow Object.keys check would miss a whole missing sub-key.
function flatKeys(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatKeys(v, full));
    else out.push(full);
  }
  return out;
}

function getIn(obj, dotted) {
  return dotted.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
function placeholders(str) {
  if (typeof str !== 'string') return [];
  return [...str.matchAll(PLACEHOLDER)].map((m) => m[1]).sort();
}

test('every locale file is valid JSON', () => {
  for (const { lang, file } of [...localeFiles(), ...localeFiles('herbs')]) {
    assert.doesNotThrow(() => load(file), `${lang}: JSON inválido`);
  }
});

test('all 17 UI locales exist', () => {
  const expected = ['en', 'de', 'cs', 'es', 'fr', 'it', 'nl', 'pl', 'sv', 'zh', 'zh-hant', 'da', 'tr', 'hi', 'ar', 'pt', 'ko'];
  const found = localeFiles().map((l) => l.lang);
  for (const lang of expected) {
    assert.ok(found.includes(lang), `locale "${lang}" não encontrado`);
  }
});

test('no key present in en.json is missing from any other locale', () => {
  const refKeys = flatKeys(load(path.join(LOCALES_DIR, `${REFERENCE}.json`)));
  assert.ok(refKeys.length > 0);

  for (const { lang, file } of localeFiles()) {
    if (lang === REFERENCE) continue;
    const dict = load(file);
    const missing = refKeys.filter((k) => getIn(dict, k) === undefined);
    assert.equal(missing.length, 0, `${lang}: faltam ${missing.length} chaves -> ${missing.slice(0, 8).join(', ')}`);
  }
});

test('no locale carries an extra key that en.json does not have', () => {
  const refKeys = new Set(flatKeys(load(path.join(LOCALES_DIR, `${REFERENCE}.json`))));

  for (const { lang, file } of localeFiles()) {
    if (lang === REFERENCE) continue;
    const extra = flatKeys(load(file)).filter((k) => !refKeys.has(k));
    assert.equal(extra.length, 0, `${lang}: ${extra.length} chaves a mais -> ${extra.slice(0, 8).join(', ')}`);
  }
});

test('interpolation placeholders survive translation in every locale', () => {
  const ref = load(path.join(LOCALES_DIR, `${REFERENCE}.json`));
  const refKeys = flatKeys(ref).filter((k) => placeholders(getIn(ref, k)).length > 0);

  for (const { lang, file } of localeFiles()) {
    if (lang === REFERENCE) continue;
    const dict = load(file);
    for (const key of refKeys) {
      const expected = placeholders(getIn(ref, key));
      const actual = placeholders(getIn(dict, key));
      assert.deepEqual(
        actual,
        expected,
        `${lang}: chave "${key}" deveria conter ${JSON.stringify(expected)} mas tem ${JSON.stringify(actual)}`
      );
    }
  }
});

test('no locale value is left empty', () => {
  for (const { lang, file } of localeFiles()) {
    const dict = load(file);
    const empty = flatKeys(dict).filter((k) => {
      const v = getIn(dict, k);
      return typeof v === 'string' && v.trim() === '';
    });
    assert.equal(empty.length, 0, `${lang}: valores vazios -> ${empty.slice(0, 8).join(', ')}`);
  }
});

// The herb detail files are keyed by a stable camelCase species id shared across
// languages (the display name differs per locale, so it can't be the join key).
// This is the check that caught real drift when the 98 herbs were translated.
test('herb detail files have identical species ids in every language', () => {
  const files = localeFiles('herbs');
  if (files.length === 0) return;
  const refIds = Object.keys(load(files.find((f) => f.lang === REFERENCE).file)).sort();

  for (const { lang, file } of files) {
    const ids = Object.keys(load(file)).sort();
    assert.deepEqual(ids, refIds, `${lang}: ids de ervas divergem do inglês (${ids.length} vs ${refIds.length})`);
  }
});

// The fish/bird field-guide files follow the same two-tier pattern as the herbs:
// a light list in the main locale bundle, heavy prose in {code}-species.json.
// Same drift risk, so the same guard.
test('species detail files have identical ids and complete fields in every language', () => {
  const files = localeFiles('species');
  if (files.length === 0) return;

  const ref = load(files.find((f) => f.lang === REFERENCE).file);
  const refFish = Object.keys(ref.fishDetails || {}).sort();
  const refBird = Object.keys(ref.birdDetails || {}).sort();
  assert.ok(refFish.length > 0 && refBird.length > 0);

  for (const { lang, file } of files) {
    const data = load(file);
    assert.deepEqual(Object.keys(data.fishDetails || {}).sort(), refFish, `${lang}: ids de peixe divergem`);
    assert.deepEqual(Object.keys(data.birdDetails || {}).sort(), refBird, `${lang}: ids de pássaro divergem`);

    for (const group of ['fishDetails', 'birdDetails']) {
      for (const [id, entry] of Object.entries(data[group])) {
        for (const field of ['overview', 'habitat', 'curiosity']) {
          assert.ok(
            typeof entry[field] === 'string' && entry[field].trim(),
            `${lang}: ${group}.${id}.${field} vazio`
          );
        }
      }
    }
  }
});

// Every species in the fish/bird collection lists must have a matching
// field-guide entry - otherwise a tappable card opens an empty screen.
// Every species listed in a Discover collection must have a field-guide entry in
// the same language, or tapping it opens a blank screen.
//
// The pairs below started as a hardcoded two - fish and birds - and that is the
// trap: four more collections shipped on 2026-07-30 and would have been guarded
// by nothing. Add a collection here whenever one is added to DiscoverScreen's
// TOPICS list. The medicinal herbs have their own test below (different file).
const COLLECTION_GROUPS = [
  ['oceanAndRiverFish', 'fishDetails'],
  ['birdsOfTheWorld', 'birdDetails'],
  ['gardenInsects', 'insectDetails'],
  ['fungiOfTheWorld', 'fungiDetails'],
  ['fromFieldToPlate', 'cropDetails'],
  ['heardNotSeen', 'soundDetails'],
];

test('every species in every Discover collection has a field-guide entry', () => {
  const detailFiles = new Map(localeFiles('species').map((f) => [f.lang, f.file]));
  if (detailFiles.size === 0) return;

  for (const { lang, file } of localeFiles()) {
    const detailFile = detailFiles.get(lang);
    if (!detailFile) continue;
    const detail = load(detailFile);
    const topics = load(file)?.discover?.topics;

    for (const [topicKey, group] of COLLECTION_GROUPS) {
      const list = topics?.[topicKey]?.species;
      assert.ok(Array.isArray(list), `${lang}: coleção ${topicKey} não existe`);
      const missingId = list.filter((s) => !s.id).length;
      assert.equal(missingId, 0, `${lang}: ${topicKey} tem ${missingId} espécies sem id`);
      const orphans = list.map((s) => s.id).filter((id) => !detail[group]?.[id]);
      assert.equal(orphans.length, 0, `${lang}: ${topicKey} sem ficha -> ${orphans.join(', ')}`);
    }
  }
});

test('scientific names are identical in every language', () => {
  // A binomial is the same worldwide, and it is the key the app uses to fetch a
  // species photo from Wikipedia. One translated or mistyped `sci` means a
  // missing photo in exactly one language - the kind of thing nobody notices.
  const files = localeFiles();
  const en = load(files.find((f) => f.lang === 'en').file)?.discover?.topics;

  for (const [topicKey] of COLLECTION_GROUPS) {
    const reference = Object.fromEntries(
      (en?.[topicKey]?.species || []).map((s) => [s.id, s.sci])
    );
    for (const { lang, file } of files) {
      if (lang === 'en') continue;
      for (const s of load(file)?.discover?.topics?.[topicKey]?.species || []) {
        assert.equal(
          s.sci,
          reference[s.id],
          `${lang}/${topicKey}/${s.id}: sci "${s.sci}" difere do inglês "${reference[s.id]}"`
        );
      }
    }
  }
});

test('every Discover collection is actually rendered', () => {
  // A collection that exists only in the locale files is invisible: DiscoverScreen
  // renders from its own hardcoded TOPICS list. That already happened once - the
  // fish and bird collections shipped translated into 17 languages and never
  // appeared on screen.
  const screen = fs.readFileSync(path.join(__dirname, 'screens/DiscoverScreen.js'), 'utf8');
  for (const [topicKey] of COLLECTION_GROUPS) {
    assert.match(
      screen,
      new RegExp(`topicKey: '${topicKey}'`),
      `${topicKey} tem conteúdo traduzido mas não está em TOPICS - ninguém vai vê-la`
    );
  }
});

// Guards the exact class of bug this two-tier split can produce: the light herb
// list (discover.topics.medicinalHerbs.species[], loaded on every boot) must line
// up with the heavy per-herb detail file (fetched only when a herb is opened), or
// a user taps a herb and gets an empty screen.
//
// The join key is the stable camelCase `id`, not `name` - the display name is
// translated per locale and so cannot match across languages.
test('every herb in the list has a matching entry in that language detail file', () => {
  const detailFiles = new Map(localeFiles('herbs').map((f) => [f.lang, f.file]));
  if (detailFiles.size === 0) return;

  for (const { lang, file } of localeFiles()) {
    const detailFile = detailFiles.get(lang);
    if (!detailFile) continue;

    const herbs = load(file)?.discover?.topics?.medicinalHerbs?.species;
    if (!Array.isArray(herbs)) continue;

    const detailIds = new Set(Object.keys(load(detailFile)));
    const missing = herbs.map((h) => h.id).filter((id) => id && !detailIds.has(id));
    assert.equal(
      missing.length,
      0,
      `${lang}: ervas na lista sem detalhe -> ${missing.slice(0, 8).join(', ')}`
    );

    const withoutId = herbs.filter((h) => !h.id).length;
    assert.equal(withoutId, 0, `${lang}: ${withoutId} ervas sem campo "id"`);
  }
});
