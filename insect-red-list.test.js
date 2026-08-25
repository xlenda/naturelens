const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  INSECT_RED_LIST_I18N_KEYS,
  IUCN_RED_LIST_CODES,
  insectRedListLabel,
  normaliseInsectRedList,
} = require('./components/insectRedList');

const CASES = [
  ['EX', 'EXTINCT', 'detail.iucn.extinct'],
  ['EW', 'EXTINCT_IN_THE_WILD', 'detail.iucn.extinctInTheWild'],
  ['RE', 'REGIONALLY_EXTINCT', 'detail.iucn.regionallyExtinct'],
  ['CR', 'CRITICALLY_ENDANGERED', 'detail.iucn.criticallyEndangered'],
  ['EN', 'ENDANGERED', 'detail.iucn.endangered'],
  ['VU', 'VULNERABLE', 'detail.iucn.vulnerable'],
  ['NT', 'NEAR_THREATENED', 'detail.iucn.nearThreatened'],
  ['LC', 'LEAST_CONCERN', 'detail.iucn.leastConcern'],
  ['DD', 'DATA_DEFICIENT', 'detail.iucn.dataDeficient'],
  ['NA', 'NOT_APPLICABLE', 'detail.iucn.notApplicable'],
  ['NE', 'NOT_EVALUATED', 'detail.iucn.notEvaluated'],
];

test('normalises every current IUCN and documented backbone category', () => {
  assert.deepEqual(IUCN_RED_LIST_CODES, CASES.map(([code]) => code));
  assert.deepEqual(INSECT_RED_LIST_I18N_KEYS, CASES.map(([, , key]) => key));

  for (const [code, category, labelKey] of CASES) {
    for (const value of [code, code.toLowerCase(), category, category.toLowerCase()]) {
      assert.deepEqual(normaliseInsectRedList(value), { code, labelKey }, value);
    }
  }

  assert.deepEqual(normaliseInsectRedList(' near-threatened '), {
    code: 'NT',
    labelKey: 'detail.iucn.nearThreatened',
  });
});

test('accepts only the documented string or category object fields', () => {
  assert.deepEqual(normaliseInsectRedList({ code: 'NT' }), {
    code: 'NT',
    labelKey: 'detail.iucn.nearThreatened',
  });
  assert.deepEqual(normaliseInsectRedList({ category: 'NEAR_THREATENED' }), {
    code: 'NT',
    labelKey: 'detail.iucn.nearThreatened',
  });
  assert.deepEqual(normaliseInsectRedList({ code: 'NT', category: 'NEAR_THREATENED' }), {
    code: 'NT',
    labelKey: 'detail.iucn.nearThreatened',
  });

  assert.equal(normaliseInsectRedList({ code: 'NT', category: 'VULNERABLE' }), null);
  assert.equal(normaliseInsectRedList({ code: 'NT', category: 'unknown' }), null);
  assert.equal(normaliseInsectRedList({ description: 'Near Threatened' }), null);
});

test('unknown, malformed and React-shaped values fail closed', () => {
  for (const value of [
    null,
    undefined,
    '',
    0,
    true,
    ['NT'],
    { type: 'Text', props: { children: 'Near Threatened' } },
    'LOWER_RISK',
    'ENDANGERED SPECIES',
    'LC - Least Concern',
  ]) {
    assert.equal(normaliseInsectRedList(value), null);
  }

  const inherited = Object.create({ code: 'NT' });
  assert.equal(normaliseInsectRedList(inherited), null);

  const hostile = {};
  Object.defineProperty(hostile, 'code', {
    enumerable: true,
    get() {
      throw new Error('external getter');
    },
  });
  assert.equal(normaliseInsectRedList(hostile), null);
});

test('returns only a translated renderable label', () => {
  const translate = (key) => ({
    'detail.iucn.nearThreatened': 'Quase ameacada',
    'detail.iucn.leastConcern': 'Pouco preocupante',
  })[key] || key;

  assert.equal(insectRedListLabel('NEAR_THREATENED', translate), 'Quase ameacada');
  assert.equal(insectRedListLabel({ code: 'LC' }, translate), 'Pouco preocupante');
  assert.equal(insectRedListLabel('VULNERABLE', translate), null, 'missing key must stay hidden');
  assert.equal(insectRedListLabel('NT', () => ({ label: 'unsafe' })), null);
  assert.equal(insectRedListLabel('NT', () => 'NEAR_THREATENED'), null);
  assert.equal(insectRedListLabel('NT', () => 'NT'), null);
  assert.equal(insectRedListLabel('NT', () => { throw new Error('i18n unavailable'); }), null);
  assert.equal(insectRedListLabel('NT'), null);
  assert.equal(insectRedListLabel('unknown', translate), null);
});

test('the normaliser has no React or JSX rendering dependency', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'components', 'insectRedList.js'),
    'utf8'
  );
  assert.doesNotMatch(source, /require\(['"]react['"]\)|from\s+['"]react['"]/i);
  assert.doesNotMatch(source, /<Text\b|<View\b|React\.createElement/);
});
