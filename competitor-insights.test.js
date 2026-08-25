// Guardas das duas vantagens tiradas do dossie de 146 mil avaliacoes:
// transparencia antes da primeira foto e estacao correta sem coletar local.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const { uiLocaleFiles } = require('./test-locales');

const read = (relative) => fs.readFileSync(path.join(__dirname, relative), 'utf8');

function loadCareRegion({ location = null } = {}) {
  const memory = new Map();
  const storage = {
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => { memory.set(key, value); },
  };
  const { code } = babel.transformFileSync(path.join(__dirname, 'components/careRegion.js'), {
    presets: ['babel-preset-expo'],
  });
  const stubs = {
    '@react-native-async-storage/async-storage': storage,
    './deviceLocation': { getApproximateLocation: async () => location },
  };
  const mod = { exports: {} };
  const fakeRequire = (name) => (name in stubs ? stubs[name] : require(name));
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return { ...mod.exports, memory };
}

test('a promessa gratis aparece antes da camera e continua verdadeira no servidor', () => {
  const screen = read('screens/IdentifyScreen.js');
  const entitlement = read('api/_lib/entitlement.js');
  const promise = screen.indexOf("t('identify.freePromise')");
  const camera = screen.indexOf('style={styles.viewfinder}');

  assert.ok(promise > 0 && promise < camera, 'a regra comercial precisa ser visivel antes da primeira foto');
  assert.match(screen, /freePromise:[\s\S]{0,100}minHeight: 44/);
  assert.match(entitlement, /\(usage\?\.used_count \|\| 0\) >= 1/,
    'se o limite mudar, a promessa de uma identificacao precisa mudar junto');
});

test('os 17 idiomas explicam gratuidade e regiao sem fallback', () => {
  for (const file of uiLocaleFiles()) {
    const locale = JSON.parse(read(`public/locales/${file}`));
    for (const [section, key] of [
      ['identify', 'freePromise'],
      ['profile', 'careRegionRow'],
      ['profile', 'careRegionHint'],
      ['profile', 'careRegionAuto'],
      ['profile', 'careRegionSouth'],
      ['profile', 'careRegionNorth'],
    ]) {
      assert.ok(locale[section]?.[key]?.trim(), `${file}: missing ${section}.${key}`);
    }
  }
});

test('a regiao manual muda somente o sinal usado pelo cuidado', async () => {
  const region = loadCareRegion({ location: { latitude: -12.34, longitude: -38.5 } });
  assert.equal(await region.getCareLatitude(), -12.34, 'automatico conserva a localizacao real quando existe');

  let notified = null;
  const unsubscribe = region.subscribeCareRegion((value) => { notified = value; });
  assert.equal(await region.setCareRegionPreference(region.CARE_REGION.SOUTH), true);
  assert.equal(await region.getCareLatitude(), -23);
  assert.equal(notified, 'south');

  assert.equal(await region.setCareRegionPreference(region.CARE_REGION.NORTH), true);
  assert.equal(await region.getCareLatitude(), 23);
  assert.equal(await region.setCareRegionPreference('invented'), false);
  assert.equal(await region.getCareRegionPreference(), 'north');
  unsubscribe();
});

test('cronograma e floracao usam a regiao privada e o ajuste existe no Android', () => {
  const schedule = read('components/CareSchedule.js');
  const species = read('components/SpeciesCareCard.js');
  const settings = read('screens/SettingsScreen.js');

  for (const source of [schedule, species]) {
    assert.match(source, /getCareLatitude/);
    assert.match(source, /subscribeCareRegion/);
    assert.doesNotMatch(source, /getApproximateLocation/);
  }
  const row = settings.indexOf("label={t('profile.careRegionRow')}");
  const locationGate = settings.indexOf('{canUseLocation() && (');
  assert.ok(row > 0 && row < locationGate, 'a regiao manual nao pode sumir junto com a geolocalizacao nativa');
  assert.match(settings, /setCareRegionPreference/);
});

test('planta e arvore mostram risco, evidencia e so depois recomendacoes', () => {
  for (const relative of ['screens/PlantDetailScreen.js', 'screens/TreeDetailScreen.js']) {
    const source = read(relative);
    const safety = source.indexOf('!!plant.toxicity && (');
    const evidence = source.indexOf('<IdentificationExtras entity={plant}');
    const quickFacts = source.indexOf('<QuickFactGrid');
    const schedule = source.indexOf('<CareSchedule');

    assert.ok(safety > 0 && safety < evidence, `${relative}: risco precisa abrir a ordem editorial`);
    assert.ok(evidence < quickFacts, `${relative}: prova precisa aparecer antes dos fatos de cuidado`);
    assert.ok(quickFacts < schedule, `${relative}: resumo precisa preceder o cronograma detalhado`);
    assert.equal(source.match(/<IdentificationExtras entity=\{plant\}/g)?.length, 1,
      `${relative}: evidencia nao pode ficar duplicada no scroll`);
  }
});
