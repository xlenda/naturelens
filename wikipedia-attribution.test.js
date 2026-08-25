const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { uiLocaleFiles } = require('./test-locales');

const ROOT = __dirname;
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('every Wikipedia excerpt exposes article, authors, license and adaptation notice', () => {
  const screen = read('screens/CareTopicsScreen.js');
  const attributionStart = screen.indexOf('{activeSources.map((source) => {');
  const attributionEnd = screen.indexOf('{/* POR TIPO', attributionStart);
  const attribution = screen.slice(attributionStart, attributionEnd);

  assert.ok(attributionStart >= 0);
  assert.match(screen, /source\?\.id === 'wikipedia'/);
  assert.match(screen, /source\?\.license === 'CC-BY-SA-4\.0'/);
  assert.match(screen, /https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\//);
  assert.match(screen, /\/w\/index\.php\?title=\$\{match\[2\]\}&action=history/);
  for (const key of [
    'wikipediaExcerptNotice',
    'wikipediaArticleLink',
    'wikipediaAuthorsLink',
    'wikipediaLicenseLink',
  ]) {
    assert.match(attribution, new RegExp(`detail\\.${key}`), key);
  }
  assert.match(attribution, /Linking\.openURL\(source\.url\)/);
  assert.match(attribution, /Linking\.openURL\(historyUrl\)/);
  assert.match(attribution, /Linking\.openURL\(WIKIPEDIA_LICENSE_URL\)/);
});

test('Wikipedia attribution is translated independently in all 17 UI locales', () => {
  const files = uiLocaleFiles();
  assert.equal(files.length, 17);
  const english = JSON.parse(read('public/locales/en.json')).detail;
  const keys = [
    'wikipediaExcerptNotice',
    'wikipediaArticleLink',
    'wikipediaAuthorsLink',
    'wikipediaLicenseLink',
  ];

  for (const file of files) {
    const language = file.replace('.json', '');
    const detail = JSON.parse(read(`public/locales/${file}`)).detail;
    for (const key of keys) {
      assert.equal(typeof detail[key], 'string', `${language}/${key}`);
      assert.ok(detail[key].trim(), `${language}/${key}`);
    }
    assert.match(detail.wikipediaLicenseLink, /CC BY-SA 4\.0/, language);
    if (language !== 'en') {
      assert.notEqual(
        detail.wikipediaExcerptNotice,
        english.wikipediaExcerptNotice,
        `${language} caiu no aviso em ingles`
      );
    }
  }
});

test('in-app and published legal texts disclose server retrieval and CC BY-SA reuse', () => {
  const legal = read('components/legalTexts.js');
  const privacy = read('public/privacy.html');
  const terms = read('public/terms.html');

  for (const text of [legal, privacy]) {
    assert.match(text, /função de servidor do NatureLens consulta a Wikipédia/);
    assert.match(text, /NatureLens server function queries Wikipedia/);
    assert.match(text, /trechos selecionados e encurtados/);
    assert.match(text, /selected and shortened excerpts/);
    assert.match(text, /histórico de autores e a licença oficial/);
    assert.match(text, /author history and official license/);
    assert.match(text, /CC BY-SA 4\.0/);
  }

  for (const text of [legal, terms]) {
    assert.match(text, /Creative Commons Atribuição-CompartilhaIgual 4\.0 Internacional/);
    assert.match(text, /Creative Commons Attribution-ShareAlike 4\.0 International/);
    assert.match(text, /Cada trecho indica a adaptação/);
    assert.match(text, /Each excerpt identifies the adaptation/);
  }
});
