import {
  CROP_AGRONOMY_REGISTRY,
  canonicalCropBinomial,
  getCropAgronomyProfile,
} from './cropAgronomyRegistry';
import {
  isSupportedBrazilAdmin1Code,
  migrateAgronomyProfileToV2,
  normalizeAdmin1Code,
  normalizeCountryCode,
} from './agronomyProfileV2';

const {
  AGRONOMY_STATUS,
  createAgronomyContext,
  createAgronomyRule,
  normalizeCanonicalTaxon,
  resolveAgronomyRule,
} = require('./agronomyEngine');

const PURPOSES = new Set(['grain', 'fresh', 'processing', 'forage', 'seed', 'other']);
const SYSTEMS = new Set(['rainfed', 'irrigated', 'protected', 'hydroponic', 'other']);

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function isRealIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function entityIdentity(entity) {
  if (!isRecord(entity) || entity.category !== 'crop') return null;
  const identity = isRecord(entity.identityV1) ? entity.identityV1 : null;

  if (identity?.schemaVersion === 1 && identity.category === 'crop') {
    const canonicalName = normalizeCanonicalTaxon(identity.taxon?.canonicalName);
    if (!canonicalName) return null;
    const exact = identity.status === 'exact'
      && identity.taxon?.rank === 'species';
    return {
      canonicalName,
      rank: 'species',
      exact,
      taxonId: cleanText(identity.taxon?.gbifKey || identity.provider?.id, 120) || null,
    };
  }

  // O campo legado serve apenas para manter contexto legivel. Ele nunca
  // recupera o status exact que so identityV1 pode provar.
  if (entity.identityV1 === undefined) {
    const canonicalName = normalizeCanonicalTaxon(entity.scientific);
    if (canonicalName) {
      return { canonicalName, rank: 'species', exact: false, taxonId: null };
    }
  }
  return null;
}

function profileRegion(profile) {
  const migrated = migrateAgronomyProfileToV2(profile);
  const country = normalizeCountryCode(migrated?.location?.countryCode);
  if (!country) return null;

  const rawAdmin = cleanText(migrated.location.admin1Code, 6).toUpperCase();
  if (!rawAdmin) return { code: country, scheme: 'ISO-3166-1' };
  const admin1 = normalizeAdmin1Code(rawAdmin, country);
  if (!admin1 || (country === 'BR' && !isSupportedBrazilAdmin1Code(admin1))) return null;
  return { code: admin1, scheme: 'ISO-3166-2' };
}

function profileStage(profile) {
  const migrated = migrateAgronomyProfileToV2(profile);
  if (!migrated || migrated.planting?.stageConfirmed !== true) return null;
  const stage = cleanText(migrated.planting?.stage, 80);
  return stage ? { code: stage, scale: null } : null;
}

function profileInputs(profile) {
  const migrated = migrateAgronomyProfileToV2(profile);
  if (!migrated) return {};
  const inputs = {};
  const purpose = cleanText(migrated.purpose, 40);
  const productionSystem = cleanText(migrated.system, 40);
  const locality = cleanText(migrated.location?.locality, 80);
  const plantingDate = cleanText(migrated.planting?.date, 10);
  const soilDescription = cleanText(migrated.soil?.description, 160);

  if (PURPOSES.has(purpose)) inputs.purpose = purpose;
  if (SYSTEMS.has(productionSystem)) inputs.productionSystem = productionSystem;
  if (locality.length >= 2) inputs.locality = locality;
  if (isRealIsoDate(plantingDate)) inputs.plantingDate = plantingDate;
  if (soilDescription || typeof migrated.soil?.hasReport === 'boolean') {
    inputs.soil = {};
    if (soilDescription) inputs.soil.description = soilDescription;
    if (typeof migrated.soil?.hasReport === 'boolean') {
      inputs.soil.hasReport = migrated.soil.hasReport;
    }
  }
  return inputs;
}

function ruleId(profileKey, scientific, aliasIndex) {
  const taxon = canonicalCropBinomial(scientific).replace(/[^a-z0-9]+/g, '-');
  return `crop-guide-${profileKey}-${taxon}-${aliasIndex}-v1`;
}

function buildGuideRule(profile, scientific, aliasIndex) {
  const sourceIds = profile.sourceRefs.map((reference) => reference.sourceId);
  return createAgronomyRule({
    id: ruleId(profile.key, scientific, aliasIndex),
    kind: 'guide',
    priority: scientific === profile.scientific ? 10 : 5,
    taxon: { canonicalName: scientific, rank: 'species' },
    applicability: {},
    requiredInputs: [],
    guideId: `crop-registry-${profile.key}-v1`,
    sourceIds,
    output: {
      profileKey: profile.key,
      primaryScientific: profile.scientific,
      matchedScientific: scientific,
      exactAlias: scientific !== profile.scientific,
      agronomyRouting: profile.exposure.agronomyRouting,
      purposes: profile.purposes,
      requiredContexts: profile.requiredContexts,
      currentModules: profile.modules.current,
      conditionalModules: profile.modules.conditional,
      plannedModules: profile.modules.planned,
      sourceRefs: profile.sourceRefs,
    },
  });
}

export const CROP_AGRONOMY_GUIDE_RULES = Object.freeze(
  CROP_AGRONOMY_REGISTRY.flatMap((profile) =>
    [profile.scientific, ...profile.exactAliases].map((scientific, aliasIndex) =>
      buildGuideRule(profile, scientific, aliasIndex)
    )
  )
);

const RULES_BY_TAXON = (() => {
  const index = {};
  for (const rule of CROP_AGRONOMY_GUIDE_RULES) {
    const key = canonicalCropBinomial(rule.taxon.canonicalName);
    if (!key || index[key]) throw new Error(`duplicate agronomy guide rule: ${rule.id}`);
    index[key] = Object.freeze([rule]);
  }
  return Object.freeze(index);
})();

export function buildAgronomyContextForEntity(entity, profile) {
  return createAgronomyContext({
    identity: entityIdentity(entity),
    region: profileRegion(profile),
    stage: profileStage(profile),
    // O wizard nao coleta metodo analitico. Relatorio presente e texto livre
    // nao autorizam inferir Mehlich, resina, agua, CaCl2 ou qualquer outro.
    methods: {},
    inputs: profileInputs(profile),
  });
}

export function getAgronomyRulesForEntity(entity) {
  const context = buildAgronomyContextForEntity(entity, null);
  if (context.identity?.exact !== true) return Object.freeze([]);
  const profile = getCropAgronomyProfile(context.identity.canonicalName);
  if (!profile) return Object.freeze([]);
  const key = canonicalCropBinomial(context.identity.canonicalName);
  return RULES_BY_TAXON[key] || Object.freeze([]);
}

export function resolveAgronomyWorkspace(entity, profile) {
  const context = buildAgronomyContextForEntity(entity, profile);
  const rules = getAgronomyRulesForEntity(entity);
  const resolution = resolveAgronomyRule(context, rules);
  return Object.freeze({
    ...resolution,
    profileKey: resolution.selectedRule?.output?.profileKey || null,
  });
}

export function selfCheck() {
  const declaredSourceIds = new Set();
  let expectedRuleCount = 0;
  for (const profile of CROP_AGRONOMY_REGISTRY) {
    expectedRuleCount += 1 + profile.exactAliases.length;
    for (const reference of profile.sourceRefs) declaredSourceIds.add(reference.sourceId);
  }
  if (CROP_AGRONOMY_GUIDE_RULES.length !== expectedRuleCount) {
    throw new Error('agronomy guide catalog is incomplete');
  }
  for (const rule of CROP_AGRONOMY_GUIDE_RULES) {
    if (rule.kind !== 'guide' || rule.calculationId) {
      throw new Error(`numeric agronomy rule is forbidden: ${rule.id}`);
    }
    for (const sourceId of rule.sourceIds) {
      if (!declaredSourceIds.has(sourceId)) {
        throw new Error(`undeclared agronomy source: ${sourceId}`);
      }
    }
  }
  return true;
}

export { AGRONOMY_STATUS };
