'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AGRONOMY_STATES,
  AGRONOMY_STATUS,
  AGRONOMY_VERSION,
  AgronomyContextV1,
  AgronomyRuleV1,
  createAgronomyContext,
  createAgronomyRule,
  normalizeCanonicalTaxon,
  normalizeAgronomyContextV1,
  normalizeAgronomyRuleV1,
  resolveAgronomyApplicability,
  resolveAgronomyRule,
  validateAgronomyContext,
  validateAgronomyRule,
  validateAgronomyContextV1,
  validateAgronomyRuleV1,
} = require('./components/agronomyEngine');

function maizeContext(overrides = {}) {
  const base = {
    version: 1,
    identity: {
      canonicalName: 'Zea mays',
      rank: 'species',
      exact: true,
      taxonId: 'gbif:5290052',
    },
    region: { code: 'BR-MG', scheme: 'ISO-3166-2' },
    stage: { code: 'V6', scale: 'FEHR-CAVINESS' },
    methods: { soilPh: 'water', phosphorus: 'mehlich-1' },
    inputs: {
      soil: { ph: 5.4, phosphorus: 8 },
      targetYield: 8,
    },
  };
  return {
    ...base,
    ...overrides,
    identity: overrides.identity === undefined ? base.identity : overrides.identity,
    region: overrides.region === undefined ? base.region : overrides.region,
    stage: overrides.stage === undefined ? base.stage : overrides.stage,
    methods: overrides.methods === undefined ? base.methods : overrides.methods,
    inputs: overrides.inputs === undefined ? base.inputs : overrides.inputs,
  };
}

function maizeNumericRule(overrides = {}) {
  const base = {
    version: 1,
    id: 'br-mg-maize-v6-phosphorus-v1',
    kind: 'numeric',
    priority: 10,
    taxon: { canonicalName: 'Zea mays', rank: 'species' },
    applicability: {
      regions: ['BR-MG'],
      stages: ['V6'],
      methods: { soilPh: ['water'], phosphorus: ['mehlich-1'] },
    },
    requiredInputs: [
      { path: 'soil.ph', type: 'number', min: 0, max: 14, unit: 'pH' },
      { path: 'soil.phosphorus', type: 'number', min: 0, unit: 'mg/dm3' },
      { path: 'targetYield', type: 'number', min: 0.1, unit: 't/ha' },
    ],
    calculationId: 'maize-phosphorus-br-mg-v1',
    sourceIds: ['official-matrix-2026'],
  };
  return {
    ...base,
    ...overrides,
    taxon: overrides.taxon === undefined ? base.taxon : overrides.taxon,
    applicability: overrides.applicability === undefined ? base.applicability : overrides.applicability,
    requiredInputs: overrides.requiredInputs === undefined ? base.requiredInputs : overrides.requiredInputs,
  };
}

const maizeGuideRule = {
  version: 1,
  id: 'maize-technical-guide-v1',
  kind: 'guide',
  priority: 1,
  taxon: { canonicalName: 'Zea mays', rank: 'species' },
  applicability: {},
  requiredInputs: [],
  guideId: 'maize-field-guide-v1',
  sourceIds: ['official-maize-guide'],
};

test('AgronomyContextV1 normalizes identifiers without mutating the caller', () => {
  const original = maizeContext({
    identity: { canonicalName: '  zea   mays ', rank: 'SPECIES', exact: true },
    region: { code: ' br-mg ', scheme: 'iso-3166-2' },
    stage: { code: ' v6 ', scale: 'fehr-caviness' },
    methods: { SoilPH: ' WATER ', phosphorus: 'Mehlich-1' },
  });
  const context = AgronomyContextV1(original);

  assert.equal(context.version, AGRONOMY_VERSION);
  assert.equal(context.identity.canonicalName, 'Zea mays');
  assert.equal(context.region.code, 'BR-MG');
  assert.equal(context.stage.code, 'V6');
  assert.equal(context.methods.soilph, 'water');
  assert.equal(context.methods.phosphorus, 'mehlich-1');
  assert.equal(original.identity.canonicalName, '  zea   mays ');
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.inputs));
});

test('integration aliases keep the versioned fail-closed contract', () => {
  assert.equal(AGRONOMY_STATUS, AGRONOMY_STATES);
  assert.equal(createAgronomyContext(maizeContext()).schema, 'AgronomyContext');
  assert.equal(createAgronomyRule(maizeNumericRule()).schema, 'AgronomyRule');
  assert.equal(validateAgronomyContext(maizeContext()).valid, true);
  assert.equal(validateAgronomyRule(maizeNumericRule()).valid, true);
  assert.equal(
    resolveAgronomyRule(maizeContext(), maizeNumericRule()).state,
    AGRONOMY_STATUS.CALCULATION_AVAILABLE
  );
});

test('explicit crop hybrids are exact while incomplete hybrid forms stay invalid', () => {
  assert.equal(normalizeCanonicalTaxon('Citrus x sinensis'), 'Citrus x sinensis');
  assert.equal(normalizeCanonicalTaxon('Citrus × sinensis'), 'Citrus x sinensis');
  assert.equal(normalizeCanonicalTaxon('Citrus x'), null);
  assert.equal(normalizeCanonicalTaxon('Citrus ×'), null);
  assert.equal(normalizeCanonicalTaxon('Citrus hybrid sinensis'), null);

  const context = createAgronomyContext({
    identity: { canonicalName: 'Citrus × sinensis', rank: 'species', exact: true },
  });
  const guide = createAgronomyRule({
    id: 'sweet-orange-guide-v1',
    kind: 'guide',
    taxon: { canonicalName: 'Citrus x sinensis', rank: 'species' },
    applicability: {},
    requiredInputs: [],
    guideId: 'sweet-orange-guide-v1',
  });
  assert.equal(
    resolveAgronomyRule(context, guide).state,
    AGRONOMY_STATUS.TECHNICAL_GUIDE
  );
});

test('source ids remain opaque and keep registry casing', () => {
  const rule = createAgronomyRule({
    ...maizeNumericRule(),
    sourceIds: [' embrapaMaizePlanning ', 'embrapaMaizePlanning', 'mapaAgrofit'],
  });
  assert.deepEqual(rule.sourceIds, ['embrapaMaizePlanning', 'mapaAgrofit']);
});

test('context validation is versioned and exact identities must be species', () => {
  const future = normalizeAgronomyContextV1({ version: 2 });
  assert.deepEqual(validateAgronomyContextV1(future).errors.map((error) => error.code), [
    'contextVersionUnsupported',
  ]);

  const invalidIdentity = normalizeAgronomyContextV1({
    identity: { canonicalName: 'Zea mays', rank: 'genus', exact: true },
  });
  assert.ok(validateAgronomyContextV1(invalidIdentity).errors.some((error) => error.code === 'exactIdentityMustBeSpecies'));
});

test('a complete exact context exposes the numeric calculation', () => {
  const resolution = resolveAgronomyApplicability(
    maizeContext(),
    [maizeGuideRule, maizeNumericRule()]
  );

  assert.equal(resolution.state, AGRONOMY_STATES.CALCULATION_AVAILABLE);
  assert.equal(resolution.selectedRule.id, 'br-mg-maize-v6-phosphorus-v1');
  assert.deepEqual(resolution.calculationRules.map((rule) => rule.id), [
    'br-mg-maize-v6-phosphorus-v1',
  ]);
  assert.equal(resolution.blockedNumericRules.length, 0);
});

test('conceptual taxon mutation maize to wheat fails closed', () => {
  const wheat = maizeContext({
    identity: { canonicalName: 'Triticum aestivum', rank: 'species', exact: true },
  });
  const resolution = resolveAgronomyApplicability(wheat, [maizeGuideRule, maizeNumericRule()]);

  assert.equal(resolution.state, AGRONOMY_STATES.REGIONAL_MATRIX_UNAVAILABLE);
  assert.equal(resolution.calculationRules.length, 0);
  assert.ok(
    resolution.blockedNumericRules[0].failures.some((failure) => failure.code === 'taxonMismatch')
  );
});

for (const mutation of [
  {
    name: 'region',
    context: () => maizeContext({ region: null }),
    failure: 'regionMissing',
  },
  {
    name: 'stage',
    context: () => maizeContext({ stage: null }),
    failure: 'stageMissing',
  },
  {
    name: 'analytical method',
    context: () => maizeContext({ methods: { soilPh: 'water' } }),
    failure: 'methodMissing',
  },
  {
    name: 'required input',
    context: () => maizeContext({
      inputs: { soil: { ph: 5.4, phosphorus: 8 } },
    }),
    failure: 'inputMissing',
  },
]) {
  test(`conceptual mutation removing ${mutation.name} blocks numbers and keeps only the guide`, () => {
    const resolution = resolveAgronomyApplicability(
      mutation.context(),
      [maizeGuideRule, maizeNumericRule()]
    );

    assert.equal(resolution.state, AGRONOMY_STATES.TECHNICAL_GUIDE);
    assert.equal(resolution.calculationRules.length, 0);
    assert.equal(resolution.selectedRule.id, 'maize-technical-guide-v1');
    assert.ok(
      resolution.blockedNumericRules[0].failures.some((failure) => failure.code === mutation.failure)
    );
  });
}

test('wrong region, stage, or method never counts as a compatible selector', () => {
  const mutations = [
    [maizeContext({ region: { code: 'BR-PR' } }), 'regionMismatch'],
    [maizeContext({ stage: { code: 'R1' } }), 'stageMismatch'],
    [maizeContext({ methods: { soilPh: 'cacl2', phosphorus: 'resin' } }), 'methodMismatch'],
  ];

  for (const [context, expectedFailure] of mutations) {
    const resolution = resolveAgronomyApplicability(context, [maizeNumericRule()]);
    assert.equal(resolution.state, AGRONOMY_STATES.REGIONAL_MATRIX_UNAVAILABLE);
    assert.equal(resolution.calculationRules.length, 0);
    assert.ok(
      resolution.blockedNumericRules[0].failures.some((failure) => failure.code === expectedFailure)
    );
  }
});

test('a non-exact identity cannot unlock a guide or a numeric rule', () => {
  const resolution = resolveAgronomyApplicability(
    maizeContext({ identity: { canonicalName: 'Zea mays', rank: 'species', exact: false } }),
    [maizeGuideRule, maizeNumericRule()]
  );

  assert.equal(resolution.state, AGRONOMY_STATES.REGIONAL_MATRIX_UNAVAILABLE);
  assert.equal(resolution.selectedRule, null);
  assert.ok(
    resolution.blockedNumericRules[0].failures.some((failure) => failure.code === 'identityNotExact')
  );
});

test('invalid numeric rules are quarantined instead of becoming generic tables', () => {
  const unsafe = normalizeAgronomyRuleV1(maizeNumericRule({
    applicability: {},
    requiredInputs: [],
    calculationId: null,
  }));
  const validation = validateAgronomyRuleV1(unsafe);
  const codes = validation.errors.map((error) => error.code);

  assert.equal(validation.valid, false);
  assert.ok(codes.includes('calculationIdMissing'));
  assert.ok(codes.includes('numericRegionsMissing'));
  assert.ok(codes.includes('numericStagesMissing'));
  assert.ok(codes.includes('numericMethodsMissing'));
  assert.ok(codes.includes('numericInputsMissing'));

  const resolution = resolveAgronomyApplicability(maizeContext(), [unsafe]);
  assert.equal(resolution.state, AGRONOMY_STATES.REGIONAL_MATRIX_UNAVAILABLE);
  assert.equal(resolution.invalidRules.length, 1);
  assert.equal(resolution.calculationRules.length, 0);
  assert.throws(() => AgronomyRuleV1(unsafe), /Invalid AgronomyRuleV1/);
});

test('zero remains a supplied numeric input and invalid ranges fail closed', () => {
  const zeroAllowedRule = maizeNumericRule({
    requiredInputs: [{ path: 'soil.phosphorus', type: 'number', min: 0 }],
  });
  const zeroContext = maizeContext({
    inputs: { soil: { phosphorus: 0 } },
  });
  assert.equal(
    resolveAgronomyApplicability(zeroContext, [zeroAllowedRule]).state,
    AGRONOMY_STATES.CALCULATION_AVAILABLE
  );

  const outOfRange = maizeContext({
    inputs: { soil: { ph: 15, phosphorus: 8 }, targetYield: 8 },
  });
  const blocked = resolveAgronomyApplicability(outOfRange, [maizeNumericRule()]);
  assert.equal(blocked.state, AGRONOMY_STATES.REGIONAL_MATRIX_UNAVAILABLE);
  assert.ok(
    blocked.blockedNumericRules[0].failures.some((failure) => failure.code === 'inputAboveMaximum')
  );
});
