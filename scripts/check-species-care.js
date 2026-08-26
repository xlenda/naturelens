// Portao da camada de cuidado por especie. Sem framework, so assert.
//
//   node scripts/check-species-care.js
//
// PROVA QUATRO COISAS, e as quatro ja quebraram em app de planta:
//
//   1. CONVERSAO DE UNIDADE. O USDA publica em Fahrenheit e polegada. Mostrar
//      "-43" para um leitor brasileiro achando que e Celsius nao e arredondar
//      errado: e dizer que a planta aguenta 43 graus negativos quando ela
//      aguenta 42 - e o erro passa despercebido porque o numero parece certo.
//   2. A REGRA DO FALLBACK. Dado de especie ganha; sem especie, o grupo entra
//      mas ADMITIDO como grupo; sem os dois, o card some. O jeito de quebrar
//      isso e "melhorar" o card para mostrar o grupo em silencio - e ai o app
//      passa a apresentar conselho de grupo como se fosse da especie, que e
//      exatamente o que o dono mandou consertar.
//   3. A CHAVE BINOMIAL. A regra existe em dois lugares (o script de build
//      escreve, o loader le). Aqui ela e exercitada contra o arquivo GERADO de
//      verdade, entao a checagem falha no dia em que as duas sairem de sincronia.
//   4. O ROTULO AGRONOMICO. Fertility Requirement descreve a fertilidade do
//      solo; chama-la de necessidade de adubo transforma um indicador em acao.
//
// Os modulos sao ESM e este arquivo e CommonJS, entao passam pelo babel do
// proprio projeto: o que roda aqui e o arquivo de verdade, nao uma copia das
// regras. React, react-native e i18n sao stubados - nada aqui renderiza.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');

const STUBS = {
  react: { useEffect: () => {}, useState: () => [null, () => {}] },
  'react-native': {
    View: 'View',
    Text: 'Text',
    StyleSheet: { create: (s) => s, hairlineWidth: 1 },
    Platform: { OS: 'web' },
  },
  'react-i18next': { useTranslation: () => ({ t: (k) => k, i18n: { language: 'en' } }) },
  '@react-native-async-storage/async-storage': {
    getItem: async () => null,
    setItem: async () => {},
  },
  '@expo/vector-icons': { Ionicons: 'Ionicons' },
  'expo-location': {
    Accuracy: { Balanced: 3 },
    requestForegroundPermissionsAsync: async () => ({ status: 'denied' }),
    getCurrentPositionAsync: async () => null,
  },
};

function load(relative) {
  const file = path.join(root, relative);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const fakeRequire = (name) => {
    if (STUBS[name]) return STUBS[name];
    // Import relativo de outro componente: carrega de verdade quando e logica
    // pura, stub quando e UI.
    if (name.startsWith('.')) {
      const target = path.join(path.dirname(file), name);
      const resolved = fs.existsSync(target + '.js') ? target + '.js' : target;
      if (/SectionCard|theme/.test(name)) return { default: 'Stub', colors: {} };
      return load(path.relative(root, resolved));
    }
    // Helper do proprio babel (@babel/runtime/*, react/jsx-runtime): tem que ser
    // o de verdade, senao o modulo transpilado nao chega a executar.
    return require(name);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

const card = load(path.join('components', 'SpeciesCareCard.js'));
const loader = load(path.join('components', 'speciesCare.js'));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log('  ok  ' + name);
};

// ---------------------------------------------------------------- 1. unidade
check('Fahrenheit vira Celsius', () => {
  assert.equal(card.toCelsius(32), 0);
  assert.equal(card.toCelsius(212), 100);
  assert.equal(card.toCelsius(-40), -40); // o unico ponto onde as escalas se cruzam
  // O valor real de Acer rubrum no arquivo gerado.
  assert.equal(card.toCelsius(-43), -42);
  // Nunca converte o que nao e numero - o card so mostra linha com valor.
  assert.equal(card.toCelsius(null), null);
  assert.equal(card.toCelsius(undefined), null);
  assert.equal(card.toCelsius(NaN), null);
  assert.equal(card.toCelsius('-43'), null);
});

check('polegada vira centimetro e milimetro', () => {
  assert.equal(card.toCm(1), 3); // 2,54 arredonda para 3
  assert.equal(card.toCm(12), 30);
  assert.equal(card.toCm(32), 81);
  assert.equal(card.toMm(1), 25);
  assert.equal(card.toMm(29), 737);
  assert.equal(card.toCm(null), null);
  assert.equal(card.toMm(undefined), null);
});

// ---------------------------------------------------------------- 2. fallback
check('especie ganha do grupo, e sem os dois o card some', () => {
  const record = { moisture: 'high' };
  const advice = 'Cactos regam pouco.';
  assert.equal(card.careLayer(record, advice), 'species', 'especie na frente do grupo');
  assert.equal(card.careLayer(record, null), 'species', 'especie sozinha basta');
  assert.equal(card.careLayer(null, advice), 'group', 'sem especie, cai pro grupo');
  assert.equal(card.careLayer(null, null), null, 'sem nada, nada renderiza');
  assert.equal(card.careLayer(undefined, undefined), null, 'ausencia nao vira grupo');
});

// ---------------------------------------------------------- 2b. hemisferio
check('floracao inverte no hemisferio sul e some sem latitude', () => {
  assert.equal(card.bloomSeason('spring', 40), 'spring');
  assert.equal(card.bloomSeason('spring', -23.5), 'autumn');
  assert.equal(card.bloomSeason('summer', -23.5), 'winter');
  assert.equal(card.bloomSeason('winter', -33.9), 'summer');
  assert.equal(card.bloomSeason('autumn', 51.5), 'autumn');
  // Sem latitude nao ha epoca: e o motivo de a linha inteira sumir.
  assert.equal(card.bloomSeason('spring', null), null);
  assert.equal(card.bloomSeason('spring', undefined), null);
  assert.equal(card.bloomSeason('spring', NaN), null);
  assert.equal(card.bloomSeason('indeterminate', 40), null);
});

// ------------------------------------------------------------------ 3. chave
check('a chave do loader bate com o arquivo gerado', () => {
  const file = path.join(root, 'public', 'locales', 'species-care.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = Object.keys(data).filter((k) => !k.startsWith('_'));
  assert.ok(keys.length > 1000, 'o arquivo gerado tem que estar presente e cheio');

  for (const key of keys) {
    assert.equal(loader.binomialKey(key), key, 'chave nao sobrevive ao loader: ' + key);
  }

  // O que a Kindwise manda de verdade, incluindo as sujeiras.
  assert.equal(loader.binomialKey('Acer rubrum'), 'acer rubrum');
  assert.equal(loader.binomialKey('<i>Acer rubrum</i> L.'), 'acer rubrum');
  assert.equal(loader.binomialKey("Acer rubrum 'October Glory'"), 'acer rubrum');
  assert.equal(loader.binomialKey('  ACER   RUBRUM  '), 'acer rubrum');
  assert.equal(loader.binomialKey('Citrus × sinensis'), 'citrus sinensis');
  assert.equal(loader.binomialKey('Citrus x sinensis'), 'citrus sinensis');
  assert.equal(loader.binomialKey('Acer'), null, 'genero sozinho nao vira chave');
  assert.equal(loader.binomialKey(''), null);
  assert.equal(loader.binomialKey(null), null);

  // O teto medido da fonte, escrito como checagem para nao virar promessa: a
  // especie tropical tipica do app NAO esta no USDA, e o card TEM que cair pro
  // grupo. Se um dia isto falhar, a cobertura mudou e a copy pode mudar junto.
  assert.equal(data['plumeria rubra'], undefined, 'Plumeria rubra segue fora do banco');
  assert.ok(data['acer rubrum'], 'Acer rubrum segue dentro do banco');
});

check('fertilidade do solo nao vira recomendacao de adubo', () => {
  const en = JSON.parse(fs.readFileSync(path.join(root, 'public', 'locales', 'en.json'), 'utf8'));
  const pt = JSON.parse(fs.readFileSync(path.join(root, 'public', 'locales', 'pt.json'), 'utf8'));
  assert.equal(en.detail.usdaFertility, 'Soil fertility requirement');
  assert.equal(pt.detail.usdaFertility, 'Exigência de fertilidade do solo');
});

console.log('\nspecies-care: ' + checks + ' checagens passaram');
