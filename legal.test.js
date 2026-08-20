const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// A politica que o app mostra e a que o Google le tem que ser a MESMA.
//
// components/legalTexts.js se declara "transcricao fiel" de public/privacy.html,
// mas sao dois arquivos separados que alguem atualiza a mao. Ja divergiram duas
// vezes: o paragrafo do GBIF entrou so no app, e o listing da Play Store aponta
// para o HTML - ou seja, a versao que o REVISOR le era a desatualizada, e a
// divergencia entre o que o app promete e o que a politica publicada diz e
// exatamente o tipo de coisa que derruba uma submissao.
//
// Este portao compara paragrafo a paragrafo. Nao exige formatacao igual - so
// que nenhuma frase exista de um lado e falte do outro.

const raizProjeto = __dirname;

function paragrafosDoJs(chave) {
  const fonte = fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8');
  const inicio = fonte.indexOf(`${chave}`);
  assert.ok(inicio > 0, `nao achei ${chave} em legalTexts.js`);
  // Ate a proxima declaracao de topo, para nao invadir o bloco seguinte.
  const resto = fonte.slice(inicio + chave.length);
  const fim = resto.search(/\n(export )?const [A-Za-z]/);
  const bloco = fim > 0 ? resto.slice(0, fim) : resto;

  return [...bloco.matchAll(/\{\s*type:\s*'p',\s*text:\s*`([^`]+)`/g)]
    .map((m) => m[1].trim())
    .filter((t) => !t.includes('${')); // paragrafo com interpolacao varia, nao da pra comparar literal
}

// Os dois lados passam pela MESMA normalizacao. Sem isso a comparacao acusa
// divergencia onde nao ha: o HTML escreve "1&nbsp;km" e poe <strong> no meio
// do paragrafo, entao tirar as tags deixa espaco duplo. Diferenca de marcacao
// nao e diferenca de conteudo - o que importa e a frase.
function normalizar(texto) {
  return texto
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function textoDoHtml() {
  return normalizar(fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8'));
}

// Uma frase e suficiente para provar presenca e e imune a diferenca de quebra
// de linha entre os dois arquivos.
function primeiraFrase(paragrafo) {
  const normalizado = normalizar(paragrafo);
  const corte = normalizado.search(/[.:]\s/);
  return corte > 30 ? normalizado.slice(0, corte) : normalizado.slice(0, 80);
}

// A linha de data e a unica que muda de FORMA entre os dois: o app mostra
// "Ultima atualizacao: 19 de agosto de 2026" e o HTML junta os dois idiomas
// num rodape so ("Ultima atualizacao / Last updated: ... - August 19, 2026").
// Comparar a frase inteira acusaria divergencia onde nao ha. O que importa
// mesmo e a DATA bater - uma politica publicada com data velha e um problema
// de verdade -, e isso o teste da data confere.
const ehLinhaDeData = (p) => /ltima atualiza|Last updated/i.test(p);

test('a politica do app e a publicada dizem a mesma coisa (PT)', () => {
  const html = textoDoHtml();
  for (const paragrafo of paragrafosDoJs('privacyPt').filter((p) => !ehLinhaDeData(p))) {
    const frase = primeiraFrase(paragrafo);
    assert.ok(
      html.includes(frase),
      `public/privacy.html nao tem este paragrafo que o app mostra:\n  "${frase}..."`
    );
  }
});

test('a politica do app e a publicada dizem a mesma coisa (EN)', () => {
  const html = textoDoHtml();
  for (const paragrafo of paragrafosDoJs('privacyEn').filter((p) => !ehLinhaDeData(p))) {
    const frase = primeiraFrase(paragrafo);
    assert.ok(
      html.includes(frase),
      `public/privacy.html nao tem este paragrafo que o app mostra:\n  "${frase}..."`
    );
  }
});

test('o GBIF esta declarado nos dois lados', () => {
  // Especifico de proposito: o GBIF recebe o nome cientifico de TODO usuario,
  // com ou sem assinatura, e ficou meses sem aparecer em politica nenhuma.
  const html = fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8');
  const js = fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8');
  assert.match(html, /GBIF/, 'public/privacy.html nao menciona o GBIF');
  assert.match(js, /GBIF/, 'components/legalTexts.js nao menciona o GBIF');
});

test('a data de vigencia e a mesma nos dois', () => {
  const js = fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8');
  const html = normalizar(fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8'));

  // Pega a data em ingles do JS ("August 19, 2026") e exige a MESMA no HTML.
  // Se alguem revisar a politica e esquecer de republicar o HTML, o revisor da
  // Play Store le uma versao com data anterior a do app.
  const data = js.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/);
  assert.ok(data, 'nao achei data de vigencia em legalTexts.js');
  assert.ok(
    html.includes(data[1]),
    `legalTexts.js diz "${data[1]}" e public/privacy.html nao tem essa data - republique o HTML`
  );
});
