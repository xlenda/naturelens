const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { uiLocaleFiles } = require('./test-locales');

const LOCALES_DIR = path.join(__dirname, 'public', 'locales');

function load(file) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8'));
}

function stringLeaves(value, prefix = '') {
  if (typeof value === 'string') return [[prefix, value]];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    stringLeaves(child, prefix ? `${prefix}.${key}` : key)
  );
}

function getIn(value, dotted) {
  return dotted.split('.').reduce((current, key) => current?.[key], value);
}

// Esses sinais aparecem quando UTF-8 e lido como Latin-1 ou quando um
// caractere fora do encoding vira ponto de interrogacao no meio da palavra.
const UTF8_MOJIBAKE = /(?:\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00e2(?:\u0080|\u20ac)|\u00f0\u0178|\u00ef\u00bf\u00bd)/u;
const LOST_GLYPH = /(?:[\p{L}]\?[\p{L}]|\?{2,}|(?:^|\s)\?[\p{L}])/u;

test('the 17 UI locales contain no replacement characters or obvious mojibake', () => {
  const files = uiLocaleFiles();
  assert.equal(files.length, 17);

  for (const file of files) {
    const bad = stringLeaves(load(file)).filter(([, value]) =>
      value.includes('\uFFFD') || UTF8_MOJIBAKE.test(value) || LOST_GLYPH.test(value)
    );
    assert.deepEqual(
      bad,
      [],
      `${file}: texto corrompido -> ${bad.slice(0, 5).map(([key]) => key).join(', ')}`
    );
  }
});

test('recent onboarding, expedition and community copy never falls back to English', () => {
  const english = load('en.json');
  const identifyKeys = [
    'identify.expeditionTitle',
    'identify.expeditionBody',
    'identify.photoConsentBirdBody',
    ...Object.keys(english.identify.categoryPromise).map((key) => `identify.categoryPromise.${key}`),
  ];
  const guardedKeys = [
    ...identifyKeys,
    'onboarding.reviewKicker',
    ...stringLeaves(english.onboarding.review, 'onboarding.review').map(([key]) => key),
    ...stringLeaves(english.community, 'community').map(([key]) => key),
  ];
  const identicalWords = new Set([
    'es:onboarding.review.proofs.simple',
    'fr:onboarding.review.proofs.simple',
    'fr:community.scoreLabel',
  ]);
  const englishPhrases = /\b(?:Choose your expedition|Each path changes|Start with one discovery|You are building|Your field record|Advanced explorer rhythm|Your latest finds|A local league|confirmed activity|Next milestone|reachable target|power users|What raises your rank|Identify and save real finds|Complete daily missions|Explore more categories|Share the app|Is NatureLens helping|If the app made|I like it|Not now|Thanks)\b/i;

  for (const file of uiLocaleFiles()) {
    const lang = file.replace('.json', '');
    if (lang === 'en') continue;
    const locale = load(file);

    for (const key of guardedKeys) {
      const value = getIn(locale, key);
      if (identicalWords.has(`${lang}:${key}`)) continue;
      assert.notEqual(value, getIn(english, key), `${file}: ${key} caiu para o ingles`);
      assert.doesNotMatch(value, englishPhrases, `${file}: ${key} ainda contem texto ingles`);
    }

    for (const [key, value] of stringLeaves(locale.community.leagues, 'community.leagues')) {
      assert.doesNotMatch(
        value,
        /\b(?:Seed|Sprout|Guardian|Master) league\b/i,
        `${file}: ${key} ainda usa o nome ingles da liga`
      );
    }
  }
});

test('bird consent and visible legal copy disclose BioCLIP and Nyckel in every locale', () => {
  for (const file of uiLocaleFiles()) {
    const locale = load(file);
    const consent = locale.identify.photoConsentBirdBody;
    assert.ok(typeof consent === 'string' && consent.length > 80, `${file}: consentimento de aves incompleto`);

    for (const [key, value] of [
      ['identify.photoConsentBirdBody', consent],
      ['terms.serviceBody', locale.terms.serviceBody],
      ['privacy.collectBody', locale.privacy.collectBody],
      ['about.creditsBody', locale.about.creditsBody],
    ]) {
      assert.match(value, /BioCLIP/, `${file}: ${key} nao informa BioCLIP`);
      assert.match(value, /Nyckel/, `${file}: ${key} nao informa o fallback Nyckel`);
    }
  }
});

test('platform-specific sound guidance is localized in every locale', () => {
  const english = load('en.json');
  const keys = [
    'permissionAndroidBody',
    'permissionWebBody',
    'unsupportedAndroidBody',
    'unsupportedWebBody',
    'unsupportedIosBody',
  ];

  for (const file of uiLocaleFiles()) {
    const lang = file.replace('.json', '');
    const sound = load(file).sound;
    for (const key of keys) {
      assert.ok(typeof sound[key] === 'string' && sound[key].trim(), `${file}: sound.${key} ausente`);
      if (lang !== 'en') {
        assert.notEqual(sound[key], english.sound[key], `${file}: sound.${key} caiu para o ingles`);
      }
    }
  }
});
