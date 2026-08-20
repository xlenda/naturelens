const fs = require('fs');
const path = require('path');

// Quais arquivos de public/locales sao locale de INTERFACE.
//
// Era uma lista-negra copiada em 4 testes (`!/-(herbs|species|manual|groups)/`)
// e quebrou o deploy TRES vezes seguidas: toda vez que nasce um tipo novo de
// conteudo estatico (-manual, -groups, -schedule) os testes passam a contar
// esse arquivo como idioma e o portao de paridade acusa 19 idiomas em vez de
// 17. Agora e lista-BRANCA derivada do SUPPORTED_LANGUAGES do i18n.js, a
// unica fonte de verdade de quais idiomas o app tem. Conteudo novo nao mexe
// mais em teste nenhum; idioma novo entra sozinho.
//
// Le a fonte em vez de importar porque i18n.js e ESM e os testes rodam em
// CommonJS (node --test).
function supportedCodes() {
  const source = fs.readFileSync(path.join(__dirname, 'i18n.js'), 'utf8');
  const block = source.slice(source.indexOf('SUPPORTED_LANGUAGES'));
  const codes = [...block.matchAll(/code:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  if (!codes.length) throw new Error('nao consegui ler SUPPORTED_LANGUAGES do i18n.js');
  return codes;
}

/** Nomes de arquivo ('en.json', 'zh-hant.json', ...) dos locales de interface. */
function uiLocaleFiles() {
  const dir = path.join(__dirname, 'public', 'locales');
  return supportedCodes()
    .map((code) => `${code}.json`)
    .filter((file) => fs.existsSync(path.join(dir, file)));
}

module.exports = { supportedCodes, uiLocaleFiles };
