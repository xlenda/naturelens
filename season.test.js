// Guarda do Destaque da Estacao (paridade 120% - video do concorrente, 20/08).
//
// POR QUE EXISTE
// O grafico de estacao le o histograma de ocorrencias por mes do GBIF, e a
// resposta dessa API tem DUAS armadilhas que nao aparecem em nenhum teste
// manual feliz:
//
//  1. as contagens vem ordenadas por VOLUME, nao por mes - ler por indice em
//     vez de pelo campo "name" embaralha o ano inteiro e desenha um pico em
//     janeiro que na verdade e de junho;
//  2. um mes sem nenhuma ocorrencia simplesmente NAO APARECE na lista - a
//     lista pode ter 9 itens, nunca 12.
//
// A terceira guarda e de HONESTIDADE, nao de formato: com pouquissimo registro
// datado o "pico" e ruido de tres observacoes, entao o bloco tem que sumir. E
// facil alguem "melhorar" o portao trocando a soma dos meses pelo campo
// `count` da resposta (o total de registros da especie) - e ai uma especie com
// 10 mil ocorrencias das quais so 5 tem mes passaria a desenhar um grafico
// feito de 5 registros.
//
// A resposta usada no teste e a resposta REAL da API (Plumeria rubra,
// taxonKey 3169674, capturada em 20/08), nao um mock inventado.
//
// O modulo e ESM e este teste e CommonJS, entao ele passa pelo babel do
// proprio projeto - o que roda aqui e o arquivo de verdade. As dependencias de
// UI (react, react-native, i18n) sao stubadas porque so a logica pura de dado
// e exercitada; nada aqui renderiza.
//
// Rode com: node --test season.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

const file = path.join(__dirname, 'components', 'SeasonChart.js');
const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });

const stubs = {
  react: { useEffect: () => {}, useState: () => [null, () => {}] },
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
  'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: (s) => s } },
  'react-i18next': { useTranslation: () => ({ t: (k) => k, i18n: { language: 'en' } }) },
  './theme': { colors: {} },
  './gbifTaxonKey': { getTaxonKey: async () => null, GBIF_UA: 'test' },
};
const fakeRequire = (name) => (name in stubs ? stubs[name] : require(name));

const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
const { monthCounts, barHeight, MIN_RECORDS } = mod.exports;

// Resposta real de /occurrence/search?taxonKey=3169674&facet=month&facetLimit=12&limit=0
const PLUMERIA = {
  offset: 0,
  limit: 0,
  count: 230,
  results: [],
  facets: [
    {
      field: 'MONTH',
      counts: [
        { name: '6', count: 33 },
        { name: '7', count: 23 },
        { name: '10', count: 22 },
        { name: '4', count: 20 },
        { name: '11', count: 20 },
        { name: '12', count: 19 },
        { name: '1', count: 18 },
        { name: '5', count: 18 },
        { name: '3', count: 16 },
        { name: '2', count: 15 },
        { name: '9', count: 12 },
        { name: '8', count: 8 },
      ],
    },
  ],
};

test('cada contagem cai no mes do campo name, nao na ordem em que chegou', () => {
  const m = monthCounts(PLUMERIA);
  assert.equal(m.length, 12);
  // Junho (indice 5) e o pico real; janeiro (indice 0) e o PRIMEIRO da lista
  // crua e teria virado o pico numa leitura por indice.
  assert.equal(m[5], 33);
  assert.equal(m[0], 18);
  assert.equal(m[7], 8);
  assert.equal(Math.max(...m), 33);
  assert.equal(m.indexOf(Math.max(...m)), 5);
});

test('mes ausente na resposta vira zero, nao buraco nem deslocamento', () => {
  const semJulhoEAgosto = {
    facets: [{ field: 'MONTH', counts: [{ name: '1', count: 5 }, { name: '9', count: 40 }] }],
  };
  const m = monthCounts(semJulhoEAgosto);
  assert.equal(m.length, 12);
  assert.equal(m[0], 5);
  assert.equal(m[8], 40);
  assert.deepEqual(m.filter((c) => c > 0).length, 2);
  assert.equal(m[6], 0);
});

test('resposta sem facet / quebrada devolve 12 zeros em vez de estourar', () => {
  for (const bad of [null, undefined, {}, { facets: [] }, { facets: [{ field: 'YEAR', counts: [] }] }]) {
    const m = monthCounts(bad);
    assert.equal(m.length, 12);
    assert.equal(m.reduce((a, b) => a + b, 0), 0);
  }
});

test('o portao de amostra usa a soma dos meses, nao o total da especie', () => {
  // 10 mil ocorrencias, so 5 com mes: a soma e 5 e o bloco tem que sumir.
  const quaseNadaDatado = {
    count: 10000,
    facets: [{ field: 'MONTH', counts: [{ name: '3', count: 5 }] }],
  };
  const soma = monthCounts(quaseNadaDatado).reduce((a, b) => a + b, 0);
  assert.equal(soma, 5);
  assert.ok(soma < MIN_RECORDS, 'amostra de 5 registros nao pode desenhar grafico');
  // A Plumeria, com 224 registros datados, passa.
  assert.ok(monthCounts(PLUMERIA).reduce((a, b) => a + b, 0) >= MIN_RECORDS);
});

test('barra: zero nao desenha nada, o pico enche, o minusculo continua visivel', () => {
  assert.equal(barHeight(0, 33), 0);
  assert.ok(barHeight(33, 33) > barHeight(18, 33));
  assert.ok(barHeight(1, 10000) >= 3, 'um registro isolado nao pode sumir de vez');
});
