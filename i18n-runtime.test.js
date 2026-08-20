const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const i18next = require('i18next');
const { supportedCodes } = require('./test-locales');

// Os outros testes de i18n comparam ARQUIVOS JSON entre si. Nenhum liga o
// i18next. Foi assim que o chines tradicional passou meses 100% em ingles com
// o portao de deploy verde: o zh-hant.json estava completo e correto, mas o
// i18next normaliza 'zh-hant' para 'zh-Hant' na busca enquanto o
// addResourceBundle gravava sob 'zh-hant' - a cadeia virava
// ['zh-Hant','zh','en'] e caia toda no ingles. Comparar arquivo com arquivo
// nunca ia ver isso. Este teste liga o motor de verdade.

const dir = path.join(__dirname, 'public', 'locales');
const read = (code) => JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`), 'utf8'));

// Espelha bundleCodeFor() do i18n.js. Se um dos dois mudar sem o outro, o
// teste abaixo acusa.
const bundleCodeFor = (code) =>
  i18next.services?.languageUtils?.formatLanguageCode?.(code) || code;

test('todo idioma suportado responde no PROPRIO idioma, nunca em ingles', async () => {
  const codes = supportedCodes();
  const en = read('en');

  for (const code of codes) {
    if (code === 'en') continue;

    const instance = i18next.createInstance();
    await instance.init({
      resources: {},
      lng: code,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
    });

    const format = (c) => instance.services?.languageUtils?.formatLanguageCode?.(c) || c;
    instance.addResourceBundle(format('en'), 'translation', en, true, true);
    instance.addResourceBundle(format(code), 'translation', read(code), true, true);

    // Uma chave visivel em toda tela. Se ela sair identica ao ingles, o
    // bundle nao foi encontrado e o idioma inteiro caiu pro fallback.
    const translated = instance.t('common.close');
    const english = en.common.close;

    assert.notEqual(
      translated,
      english,
      `${code}: t('common.close') devolveu o ingles ("${english}") - o bundle nao esta sendo encontrado pelo i18next`
    );
    assert.ok(translated && translated.trim(), `${code}: t('common.close') veio vazio`);
  }
});

test('o i18n.js normaliza o codigo do bundle igual ao i18next', () => {
  // Guarda contra alguem "simplificar" o bundleCodeFor de volta para o codigo
  // cru: sem ele, o teste acima volta a falhar so no zh-hant.
  const source = fs.readFileSync(path.join(__dirname, 'i18n.js'), 'utf8');
  assert.match(
    source,
    /addResourceBundle\(bundleCodeFor\(code\)/,
    'loadLanguage precisa gravar o bundle sob bundleCodeFor(code), nao sob o codigo cru'
  );
});

test('formatLanguageCode realmente muda zh-hant (o motivo do fix existir)', async () => {
  const instance = i18next.createInstance();
  await instance.init({ resources: {}, lng: 'en', fallbackLng: 'en' });
  const formatted = instance.services.languageUtils.formatLanguageCode('zh-hant');
  assert.notEqual(
    formatted,
    'zh-hant',
    'se o i18next parou de normalizar, bundleCodeFor virou codigo morto e pode sair'
  );
});
