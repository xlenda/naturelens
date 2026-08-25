'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GLOBAL_AGRONOMY_SOURCE_REGISTRY,
  MODEL_CALCULATION_REQUIREMENTS,
  SOURCE_STATUS,
  SOURCE_USE,
  assertSourceUse,
  evaluateSourceUse,
  getSourcePolicy,
  isSourceUseAllowed,
  listSourcePolicies,
  validatePolicyRecord,
} = require('./components/globalAgronomySourceRegistry');

const APPROVED = ['gbif', 'wikipedia', 'soilgrids', 'agera5', 'nasa-power', 'aquacrop'];
const BLOCKED = ['worldclim', 'ecocrop', 'gaez-v4'];
const QUARANTINED = ['faostat', 'gaez-v5', 'fao-crop-calendar', 'wapor-v3'];
const ALL_IDS = [...APPROVED, ...BLOCKED, ...QUARANTINED];

test('registry contains only the thirteen audited global sources', () => {
  assert.deepEqual(Object.keys(GLOBAL_AGRONOMY_SOURCE_REGISTRY), ALL_IDS);
  assert.deepEqual(listSourcePolicies().map((source) => source.id), ALL_IDS);

  for (const sourceId of APPROVED) {
    assert.equal(getSourcePolicy(sourceId).status, SOURCE_STATUS.APPROVED, sourceId);
  }
  for (const sourceId of BLOCKED) {
    assert.equal(getSourcePolicy(sourceId).status, SOURCE_STATUS.BLOCKED, sourceId);
  }
  for (const sourceId of QUARANTINED) {
    assert.equal(getSourcePolicy(sourceId).status, SOURCE_STATUS.QUARANTINED, sourceId);
  }
});

test('every policy carries immutable license, version and provenance metadata', () => {
  for (const policy of listSourcePolicies()) {
    assert.equal(validatePolicyRecord(policy.id, policy), true, policy.id);
    assert.equal(Object.isFrozen(policy), true, policy.id);
    assert.equal(Object.isFrozen(policy.allowedUses), true, policy.id);
    assert.equal(Object.isFrozen(policy.license), true, policy.id);
    assert.equal(Object.isFrozen(policy.version), true, policy.id);
    assert.equal(Object.isFrozen(policy.provenance), true, policy.id);
    assert.match(policy.license.url, /^https:\/\//, policy.id);
    assert.match(policy.provenance.documentationUrl, /^https:\/\//, policy.id);
    assert.match(policy.provenance.datasetUrl, /^https:\/\//, policy.id);
    assert.ok(policy.version.value, policy.id);
    assert.ok(policy.version.strategy, policy.id);
  }
});

test('approved sources expose only their audited role', () => {
  assert.deepEqual(getSourcePolicy('gbif').allowedUses, [SOURCE_USE.IDENTITY]);
  assert.deepEqual(
    getSourcePolicy('wikipedia').allowedUses,
    [SOURCE_USE.DESCRIPTIVE_EVIDENCE]
  );
  assert.equal(getSourcePolicy('wikipedia').license.id, 'CC-BY-SA-4.0');
  assert.equal(getSourcePolicy('wikipedia').license.commercialUse, true);
  assert.equal(getSourcePolicy('wikipedia').license.attributionRequired, true);
  assert.equal(getSourcePolicy('wikipedia').provenance.publisher, 'Wikimedia Foundation');
  assert.equal(getSourcePolicy('wikipedia').provenance.plannedAccess, 'server-dossier');
  assert.deepEqual(getSourcePolicy('soilgrids').allowedUses, [SOURCE_USE.SOIL_ESTIMATE]);
  assert.deepEqual(getSourcePolicy('agera5').allowedUses, [SOURCE_USE.CLIMATE_CONTEXT]);
  assert.deepEqual(getSourcePolicy('nasa-power').allowedUses, [SOURCE_USE.CLIMATE_CONTEXT]);
  assert.equal(getSourcePolicy('nasa-power').priority, 'fallback');
  assert.deepEqual(getSourcePolicy('aquacrop').allowedUses, [SOURCE_USE.CALCULATION]);
  assert.equal(getSourcePolicy('aquacrop').optional, true);

  assert.equal(isSourceUseAllowed('gbif', SOURCE_USE.IDENTITY), true);
  assert.equal(isSourceUseAllowed('wikipedia', SOURCE_USE.DESCRIPTIVE_EVIDENCE), true);
  assert.equal(isSourceUseAllowed('soilgrids', SOURCE_USE.SOIL_ESTIMATE), true);
  assert.equal(isSourceUseAllowed('agera5', SOURCE_USE.CLIMATE_CONTEXT), true);
  assert.equal(isSourceUseAllowed('nasa-power', SOURCE_USE.CLIMATE_CONTEXT), true);
  assert.equal(isSourceUseAllowed('soilgrids', SOURCE_USE.CLIMATE_CONTEXT), false);
  assert.equal(isSourceUseAllowed('gbif', SOURCE_USE.SOIL_ESTIMATE), false);

  for (const forbiddenUse of [
    SOURCE_USE.IDENTITY,
    SOURCE_USE.SOIL_ESTIMATE,
    SOURCE_USE.CLIMATE_CONTEXT,
    SOURCE_USE.CALCULATION,
    SOURCE_USE.RECOMMENDATION,
  ]) {
    assert.equal(
      isSourceUseAllowed('wikipedia', forbiddenUse),
      false,
      `wikipedia:${forbiddenUse}`
    );
  }
});

test('blocked and quarantined sources have no executable use', () => {
  for (const sourceId of [...BLOCKED, ...QUARANTINED]) {
    const policy = getSourcePolicy(sourceId);
    assert.deepEqual(policy.allowedUses, [], sourceId);
    for (const requestedUse of Object.values(SOURCE_USE)) {
      const decision = evaluateSourceUse(sourceId, requestedUse);
      assert.equal(decision.allowed, false, `${sourceId}:${requestedUse}`);
      assert.equal(decision.reason, `source-${policy.status}`, `${sourceId}:${requestedUse}`);
    }
  }
});

test('unknown identifiers and uses fail closed without normalization or prototype lookup', () => {
  const unknownIds = [null, undefined, '', 'GBIF', ' gbif', 'gbif ', '__proto__', 'toString'];
  for (const sourceId of unknownIds) {
    assert.equal(getSourcePolicy(sourceId), null, String(sourceId));
    assert.deepEqual(
      evaluateSourceUse(sourceId, SOURCE_USE.CALCULATION),
      { allowed: false, reason: 'unknown-source', source: null },
      String(sourceId)
    );
    assert.equal(isSourceUseAllowed(sourceId, SOURCE_USE.RECOMMENDATION), false);
  }

  assert.deepEqual(evaluateSourceUse('gbif', 'fertilizerDose'), {
    allowed: false,
    reason: 'unknown-use',
    source: getSourcePolicy('gbif'),
  });
});

test('no audited source can produce a recommendation', () => {
  for (const sourceId of ALL_IDS) {
    const decision = evaluateSourceUse(sourceId, SOURCE_USE.RECOMMENDATION);
    assert.equal(decision.allowed, false, sourceId);
  }
});

test('AquaCrop calculation requires every audited prerequisite', () => {
  const completeContext = Object.fromEntries(
    MODEL_CALCULATION_REQUIREMENTS.map((requirement) => [requirement, true])
  );

  const empty = evaluateSourceUse('aquacrop', SOURCE_USE.CALCULATION);
  assert.equal(empty.allowed, false);
  assert.equal(empty.reason, 'missing-model-prerequisites');
  assert.deepEqual(empty.missing, MODEL_CALCULATION_REQUIREMENTS);

  for (const missingRequirement of MODEL_CALCULATION_REQUIREMENTS) {
    const context = { ...completeContext, [missingRequirement]: false };
    const decision = evaluateSourceUse('aquacrop', SOURCE_USE.CALCULATION, context);
    assert.equal(decision.allowed, false, missingRequirement);
    assert.deepEqual(decision.missing, [missingRequirement], missingRequirement);
  }

  const allowed = evaluateSourceUse('aquacrop', SOURCE_USE.CALCULATION, completeContext);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.reason, 'allowed');
  assert.equal(allowed.source.id, 'aquacrop');
});

test('non-model sources cannot be promoted into calculations by model context', () => {
  const completeContext = Object.fromEntries(
    MODEL_CALCULATION_REQUIREMENTS.map((requirement) => [requirement, true])
  );

  for (const sourceId of ALL_IDS.filter((id) => id !== 'aquacrop')) {
    assert.equal(
      isSourceUseAllowed(sourceId, SOURCE_USE.CALCULATION, completeContext),
      false,
      sourceId
    );
  }
});

test('assertion API throws a typed denial instead of silently falling back', () => {
  assert.throws(
    () => assertSourceUse('worldclim', SOURCE_USE.CALCULATION),
    (error) => {
      assert.equal(error.code, 'GLOBAL_AGRONOMY_SOURCE_USE_DENIED');
      assert.equal(error.reason, 'source-blocked');
      assert.equal(error.sourceId, 'worldclim');
      assert.equal(error.requestedUse, SOURCE_USE.CALCULATION);
      return true;
    }
  );

  assert.throws(
    () => assertSourceUse('unregistered-source', SOURCE_USE.RECOMMENDATION),
    (error) => error.code === 'GLOBAL_AGRONOMY_SOURCE_USE_DENIED' &&
      error.reason === 'unknown-source'
  );

  assert.equal(assertSourceUse('gbif', SOURCE_USE.IDENTITY).id, 'gbif');
});

test('policy record validation rejects executable rights without audited metadata', () => {
  const valid = JSON.parse(JSON.stringify(getSourcePolicy('gbif')));
  assert.equal(validatePolicyRecord('gbif', valid), true);

  assert.equal(validatePolicyRecord('gbif', { ...valid, id: 'other' }), false);
  assert.equal(validatePolicyRecord('gbif', { ...valid, status: 'trusted' }), false);
  assert.equal(validatePolicyRecord('gbif', { ...valid, allowedUses: ['fertilizerDose'] }), false);
  assert.equal(
    validatePolicyRecord('gbif', {
      ...valid,
      status: SOURCE_STATUS.BLOCKED,
      allowedUses: [SOURCE_USE.IDENTITY],
    }),
    false
  );
  assert.equal(validatePolicyRecord('gbif', { ...valid, version: null }), false);
  assert.equal(validatePolicyRecord('gbif', { ...valid, license: { ...valid.license, url: '' } }), false);
  assert.equal(
    validatePolicyRecord('gbif', {
      ...valid,
      license: { ...valid.license, commercialUse: false },
    }),
    false
  );
  assert.equal(
    validatePolicyRecord('gbif', {
      ...valid,
      allowedUses: [SOURCE_USE.RECOMMENDATION],
    }),
    false
  );
  assert.equal(validatePolicyRecord('gbif', { ...valid, limitations: [] }), false);
  assert.equal(
    validatePolicyRecord('gbif', {
      ...valid,
      provenance: { ...valid.provenance, documentationUrl: 'http://insecure.example' },
    }),
    false
  );

  const aquaCrop = JSON.parse(JSON.stringify(getSourcePolicy('aquacrop')));
  delete aquaCrop.calculationRequirements;
  assert.equal(validatePolicyRecord('aquacrop', aquaCrop), false);
});
