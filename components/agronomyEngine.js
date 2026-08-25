'use strict';

const AGRONOMY_CONTEXT_SCHEMA = 'AgronomyContext';
const AGRONOMY_RULE_SCHEMA = 'AgronomyRule';
const AGRONOMY_RESOLUTION_SCHEMA = 'AgronomyResolution';
const AGRONOMY_VERSION = 1;

const AGRONOMY_STATES = Object.freeze({
  CALCULATION_AVAILABLE: 'calculationAvailable',
  TECHNICAL_GUIDE: 'technicalGuide',
  REGIONAL_MATRIX_UNAVAILABLE: 'regionalMatrixUnavailable',
});
const AGRONOMY_STATUS = AGRONOMY_STATES;

const RULE_KINDS = new Set(['numeric', 'guide']);
const INPUT_TYPES = new Set(['number', 'string', 'boolean', 'enum']);

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanString(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return cleaned || null;
}

function normalizeCanonicalTaxon(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const parts = cleaned.replace(/\u00d7/g, 'x').split(' ');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const genus = parts[0];
  const hybrid = parts.length === 3;
  const species = hybrid ? parts[2] : parts[1];
  if (hybrid && parts[1].toLowerCase() !== 'x') return null;
  if (!hybrid && parts[1].toLowerCase() === 'x') return null;
  if (!/^[A-Za-z][A-Za-z-]*$/.test(genus) || !/^[a-z][a-z-]*$/.test(species)) return null;
  return genus[0].toUpperCase()
    + genus.slice(1).toLowerCase()
    + (hybrid ? ' x ' : ' ')
    + species.toLowerCase();
}

function normalizeCode(value, uppercase) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  return uppercase ? cleaned.toUpperCase() : cleaned.toLowerCase();
}

function cloneData(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(cloneData);
  if (!isPlainObject(value)) return null;
  const copy = {};
  for (const key of Object.keys(value)) {
    if (value[key] === undefined || typeof value[key] === 'function') continue;
    copy[key] = cloneData(value[key]);
  }
  return copy;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

function normalizedMethods(methods) {
  if (!isPlainObject(methods)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(methods)) {
    const key = normalizeCode(rawKey, false);
    const value = normalizeCode(rawValue, false);
    if (key && value) output[key] = value;
  }
  return output;
}

function normalizedMethodRequirements(methods) {
  if (!isPlainObject(methods)) return {};
  const output = {};
  for (const [rawKey, rawValues] of Object.entries(methods)) {
    const key = normalizeCode(rawKey, false);
    if (!key) continue;
    const values = (Array.isArray(rawValues) ? rawValues : [rawValues])
      .map((value) => normalizeCode(value, false))
      .filter(Boolean);
    if (values.length) output[key] = Array.from(new Set(values));
  }
  return output;
}

function normalizedCodes(values, uppercase) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : values == null ? [] : [values])
      .map((value) => normalizeCode(value, uppercase))
      .filter(Boolean)
  ));
}

function normalizedOpaqueIds(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : values == null ? [] : [values])
      .map(cleanString)
      .filter(Boolean)
  ));
}

function normalizedInputRequirement(requirement) {
  const source = isPlainObject(requirement) ? requirement : {};
  const path = cleanString(source.path);
  const type = normalizeCode(source.type, false);
  const output = {
    path,
    type,
  };
  if (Number.isFinite(source.min)) output.min = source.min;
  if (Number.isFinite(source.max)) output.max = source.max;
  if (source.unit != null) output.unit = cleanString(source.unit);
  if (Array.isArray(source.allowed)) {
    output.allowed = source.allowed.map(cloneData).filter((value) => value !== null);
  }
  return output;
}

function normalizeAgronomyContextV1(input) {
  const source = isPlainObject(input) ? input : {};
  const identitySource = isPlainObject(source.identity) ? source.identity : {};
  const regionSource = isPlainObject(source.region) ? source.region : {};
  const stageSource = isPlainObject(source.stage) ? source.stage : {};
  const canonicalName = normalizeCanonicalTaxon(identitySource.canonicalName);
  const regionCode = normalizeCode(regionSource.code, true);
  const stageCode = normalizeCode(stageSource.code, true);

  return deepFreeze({
    schema: source.schema == null ? AGRONOMY_CONTEXT_SCHEMA : cleanString(source.schema),
    version: source.version == null ? AGRONOMY_VERSION : source.version,
    identity: canonicalName || identitySource.exact === true || identitySource.rank != null
      ? {
          canonicalName,
          rank: normalizeCode(identitySource.rank, false),
          exact: identitySource.exact === true,
          taxonId: cleanString(identitySource.taxonId),
        }
      : null,
    region: regionCode
      ? { code: regionCode, scheme: normalizeCode(regionSource.scheme, true) }
      : null,
    stage: stageCode
      ? { code: stageCode, scale: normalizeCode(stageSource.scale, true) }
      : null,
    methods: normalizedMethods(source.methods),
    inputs: isPlainObject(source.inputs) ? cloneData(source.inputs) : {},
  });
}

function normalizeAgronomyRuleV1(input) {
  const source = isPlainObject(input) ? input : {};
  const taxonSource = isPlainObject(source.taxon) ? source.taxon : {};
  const applicabilitySource = isPlainObject(source.applicability) ? source.applicability : {};
  const requirements = Array.isArray(source.requiredInputs)
    ? source.requiredInputs.map(normalizedInputRequirement)
    : [];

  return deepFreeze({
    schema: source.schema == null ? AGRONOMY_RULE_SCHEMA : cleanString(source.schema),
    version: source.version == null ? AGRONOMY_VERSION : source.version,
    id: cleanString(source.id),
    kind: normalizeCode(source.kind, false),
    priority: Number.isFinite(source.priority) ? source.priority : 0,
    taxon: {
      canonicalName: normalizeCanonicalTaxon(taxonSource.canonicalName),
      rank: normalizeCode(taxonSource.rank, false),
    },
    applicability: {
      regions: normalizedCodes(applicabilitySource.regions, true),
      stages: normalizedCodes(applicabilitySource.stages, true),
      methods: normalizedMethodRequirements(applicabilitySource.methods),
    },
    requiredInputs: requirements,
    calculationId: cleanString(source.calculationId),
    guideId: cleanString(source.guideId),
    sourceIds: normalizedOpaqueIds(source.sourceIds),
    output: isPlainObject(source.output) ? cloneData(source.output) : null,
  });
}

function validationResult(errors) {
  return deepFreeze({ valid: errors.length === 0, errors });
}

function validateAgronomyContextV1(context) {
  const errors = [];
  if (!isPlainObject(context)) return validationResult([{ code: 'contextNotObject' }]);
  if (context.schema !== AGRONOMY_CONTEXT_SCHEMA) errors.push({ code: 'contextSchemaUnsupported' });
  if (context.version !== AGRONOMY_VERSION) errors.push({ code: 'contextVersionUnsupported' });
  if (context.identity != null) {
    if (!isPlainObject(context.identity)) errors.push({ code: 'identityInvalid' });
    else {
      if (context.identity.canonicalName != null && !normalizeCanonicalTaxon(context.identity.canonicalName)) {
        errors.push({ code: 'taxonInvalid' });
      }
      if (context.identity.exact === true && context.identity.rank !== 'species') {
        errors.push({ code: 'exactIdentityMustBeSpecies' });
      }
      if (context.identity.exact === true && !context.identity.canonicalName) {
        errors.push({ code: 'exactIdentityMissingTaxon' });
      }
    }
  }
  if (context.region != null && (!isPlainObject(context.region) || !cleanString(context.region.code))) {
    errors.push({ code: 'regionInvalid' });
  }
  if (context.stage != null && (!isPlainObject(context.stage) || !cleanString(context.stage.code))) {
    errors.push({ code: 'stageInvalid' });
  }
  if (!isPlainObject(context.methods)) errors.push({ code: 'methodsInvalid' });
  if (!isPlainObject(context.inputs)) errors.push({ code: 'inputsInvalid' });
  return validationResult(errors);
}

function validateAgronomyRuleV1(rule) {
  const errors = [];
  if (!isPlainObject(rule)) return validationResult([{ code: 'ruleNotObject' }]);
  if (rule.schema !== AGRONOMY_RULE_SCHEMA) errors.push({ code: 'ruleSchemaUnsupported' });
  if (rule.version !== AGRONOMY_VERSION) errors.push({ code: 'ruleVersionUnsupported' });
  if (!cleanString(rule.id)) errors.push({ code: 'ruleIdMissing' });
  if (!RULE_KINDS.has(rule.kind)) errors.push({ code: 'ruleKindInvalid' });
  if (!isPlainObject(rule.taxon) || rule.taxon.rank !== 'species' || !normalizeCanonicalTaxon(rule.taxon.canonicalName)) {
    errors.push({ code: 'ruleExactSpeciesMissing' });
  }

  const applicability = isPlainObject(rule.applicability) ? rule.applicability : null;
  if (!applicability) errors.push({ code: 'applicabilityInvalid' });

  const seenPaths = new Set();
  if (!Array.isArray(rule.requiredInputs)) errors.push({ code: 'requiredInputsInvalid' });
  else {
    for (const requirement of rule.requiredInputs) {
      if (!isPlainObject(requirement) || !cleanString(requirement.path)) {
        errors.push({ code: 'requiredInputPathMissing' });
        continue;
      }
      if (seenPaths.has(requirement.path)) errors.push({ code: 'requiredInputPathDuplicate', path: requirement.path });
      seenPaths.add(requirement.path);
      if (!INPUT_TYPES.has(requirement.type)) {
        errors.push({ code: 'requiredInputTypeInvalid', path: requirement.path });
      }
      if (Number.isFinite(requirement.min) && Number.isFinite(requirement.max) && requirement.min > requirement.max) {
        errors.push({ code: 'requiredInputRangeInvalid', path: requirement.path });
      }
      if (requirement.type === 'enum' && (!Array.isArray(requirement.allowed) || requirement.allowed.length === 0)) {
        errors.push({ code: 'requiredInputAllowedMissing', path: requirement.path });
      }
    }
  }

  // Regra numerica sem estes seletores parece aplicavel fora da calibracao.
  if (rule.kind === 'numeric') {
    if (!cleanString(rule.calculationId)) errors.push({ code: 'calculationIdMissing' });
    if (!applicability || !Array.isArray(applicability.regions) || applicability.regions.length === 0) {
      errors.push({ code: 'numericRegionsMissing' });
    }
    if (!applicability || !Array.isArray(applicability.stages) || applicability.stages.length === 0) {
      errors.push({ code: 'numericStagesMissing' });
    }
    if (!applicability || !isPlainObject(applicability.methods) || Object.keys(applicability.methods).length === 0) {
      errors.push({ code: 'numericMethodsMissing' });
    }
    if (!Array.isArray(rule.requiredInputs) || rule.requiredInputs.length === 0) {
      errors.push({ code: 'numericInputsMissing' });
    }
  }
  return validationResult(errors);
}

function AgronomyContextV1(input) {
  const context = normalizeAgronomyContextV1(input);
  const validation = validateAgronomyContextV1(context);
  if (!validation.valid) {
    const error = new TypeError('Invalid AgronomyContextV1');
    error.details = validation.errors;
    throw error;
  }
  return context;
}

function AgronomyRuleV1(input) {
  const rule = normalizeAgronomyRuleV1(input);
  const validation = validateAgronomyRuleV1(rule);
  if (!validation.valid) {
    const error = new TypeError('Invalid AgronomyRuleV1');
    error.details = validation.errors;
    throw error;
  }
  return rule;
}

function ownPathValue(object, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let current = object;
  for (const part of parts) {
    if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { found: false, value: undefined };
    }
    current = current[part];
  }
  return { found: true, value: current };
}

function missingValue(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function inputFailure(requirement, inputs) {
  const result = ownPathValue(inputs, requirement.path);
  if (!result.found || missingValue(result.value)) {
    return { code: 'inputMissing', field: requirement.path };
  }
  const value = result.value;
  if (requirement.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { code: 'inputTypeMismatch', field: requirement.path, expected: 'number' };
    }
    if (Number.isFinite(requirement.min) && value < requirement.min) {
      return { code: 'inputBelowMinimum', field: requirement.path, expected: requirement.min, actual: value };
    }
    if (Number.isFinite(requirement.max) && value > requirement.max) {
      return { code: 'inputAboveMaximum', field: requirement.path, expected: requirement.max, actual: value };
    }
  } else if (requirement.type === 'string') {
    if (typeof value !== 'string' || !value.trim()) {
      return { code: 'inputTypeMismatch', field: requirement.path, expected: 'string' };
    }
  } else if (requirement.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return { code: 'inputTypeMismatch', field: requirement.path, expected: 'boolean' };
    }
  } else if (requirement.type === 'enum') {
    if (!requirement.allowed.some((allowed) => Object.is(allowed, value))) {
      return { code: 'inputValueUnsupported', field: requirement.path, expected: requirement.allowed, actual: value };
    }
  }
  return null;
}

function applicabilityFailures(context, rule) {
  const failures = [];
  if (
    context.identity?.exact !== true
      || context.identity?.rank !== 'species'
      || !context.identity?.canonicalName
  ) {
    failures.push({ code: 'identityNotExact', field: 'identity' });
    return failures;
  }
  if (context.identity.canonicalName !== rule.taxon.canonicalName) {
    failures.push({
      code: 'taxonMismatch',
      field: 'identity.canonicalName',
      expected: rule.taxon.canonicalName,
      actual: context.identity.canonicalName,
    });
    return failures;
  }

  if (rule.applicability.regions.length) {
    if (!context.region?.code) failures.push({ code: 'regionMissing', field: 'region.code' });
    else if (!rule.applicability.regions.includes(context.region.code)) {
      failures.push({ code: 'regionMismatch', field: 'region.code', expected: rule.applicability.regions, actual: context.region.code });
    }
  }
  if (rule.applicability.stages.length) {
    if (!context.stage?.code) failures.push({ code: 'stageMissing', field: 'stage.code' });
    else if (!rule.applicability.stages.includes(context.stage.code)) {
      failures.push({ code: 'stageMismatch', field: 'stage.code', expected: rule.applicability.stages, actual: context.stage.code });
    }
  }
  for (const [methodKey, allowed] of Object.entries(rule.applicability.methods)) {
    const actual = context.methods[methodKey];
    if (!actual) failures.push({ code: 'methodMissing', field: `methods.${methodKey}` });
    else if (!allowed.includes(actual)) {
      failures.push({ code: 'methodMismatch', field: `methods.${methodKey}`, expected: allowed, actual });
    }
  }
  for (const requirement of rule.requiredInputs) {
    const failure = inputFailure(requirement, context.inputs);
    if (failure) failures.push(failure);
  }
  return failures;
}

function sortRules(rules) {
  return rules.slice().sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function resolveAgronomyApplicability(contextInput, ruleInputs) {
  const context = normalizeAgronomyContextV1(contextInput);
  const contextValidation = validateAgronomyContextV1(context);
  const invalidRules = [];
  const evaluatedRules = [];

  if (contextValidation.valid && Array.isArray(ruleInputs)) {
    for (let index = 0; index < ruleInputs.length; index += 1) {
      const rule = normalizeAgronomyRuleV1(ruleInputs[index]);
      const validation = validateAgronomyRuleV1(rule);
      if (!validation.valid) {
        invalidRules.push({ index, id: rule.id, errors: validation.errors });
        continue;
      }
      const failures = applicabilityFailures(context, rule);
      evaluatedRules.push({ rule, applicable: failures.length === 0, failures });
    }
  }

  const numericRules = sortRules(
    evaluatedRules.filter((entry) => entry.applicable && entry.rule.kind === 'numeric').map((entry) => entry.rule)
  );
  const guideRules = sortRules(
    evaluatedRules.filter((entry) => entry.applicable && entry.rule.kind === 'guide').map((entry) => entry.rule)
  );
  const blockedNumericRules = evaluatedRules
    .filter((entry) => !entry.applicable && entry.rule.kind === 'numeric')
    .map((entry) => ({ id: entry.rule.id, failures: entry.failures }));

  let state = AGRONOMY_STATES.REGIONAL_MATRIX_UNAVAILABLE;
  if (numericRules.length) state = AGRONOMY_STATES.CALCULATION_AVAILABLE;
  else if (guideRules.length) state = AGRONOMY_STATES.TECHNICAL_GUIDE;

  return deepFreeze({
    schema: AGRONOMY_RESOLUTION_SCHEMA,
    version: AGRONOMY_VERSION,
    state,
    context,
    contextErrors: contextValidation.errors,
    calculationRules: numericRules,
    technicalGuideRules: guideRules,
    selectedRule: numericRules[0] || guideRules[0] || null,
    blockedNumericRules,
    invalidRules,
  });
}

const createAgronomyContext = AgronomyContextV1;
const createAgronomyRule = AgronomyRuleV1;

function validateAgronomyContext(input) {
  return validateAgronomyContextV1(normalizeAgronomyContextV1(input));
}

function validateAgronomyRule(input) {
  return validateAgronomyRuleV1(normalizeAgronomyRuleV1(input));
}

function resolveAgronomyRule(contextInput, ruleOrRules) {
  const rules = Array.isArray(ruleOrRules)
    ? ruleOrRules
    : ruleOrRules == null
      ? []
      : [ruleOrRules];
  return resolveAgronomyApplicability(contextInput, rules);
}

module.exports = {
  AGRONOMY_CONTEXT_SCHEMA,
  AGRONOMY_RULE_SCHEMA,
  AGRONOMY_VERSION,
  AGRONOMY_STATES,
  AGRONOMY_STATUS,
  AgronomyContextV1,
  AgronomyRuleV1,
  createAgronomyContext,
  createAgronomyRule,
  normalizeCanonicalTaxon,
  normalizeAgronomyContextV1,
  normalizeAgronomyRuleV1,
  validateAgronomyContextV1,
  validateAgronomyRuleV1,
  validateAgronomyContext,
  validateAgronomyRule,
  resolveAgronomyApplicability,
  resolveAgronomyRule,
};
