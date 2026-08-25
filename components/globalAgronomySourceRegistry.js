'use strict';

const REGISTRY_VERSION = 1;
const AUDITED_AT = '2026-08-24';

const SOURCE_STATUS = Object.freeze({
  APPROVED: 'approved',
  BLOCKED: 'blocked',
  QUARANTINED: 'quarantined',
});

const SOURCE_USE = Object.freeze({
  IDENTITY: 'identity',
  DESCRIPTIVE_EVIDENCE: 'descriptiveEvidence',
  SOIL_ESTIMATE: 'soilEstimate',
  CLIMATE_CONTEXT: 'climateContext',
  CALCULATION: 'calculation',
  RECOMMENDATION: 'recommendation',
});

const MODEL_CALCULATION_REQUIREMENTS = Object.freeze([
  'exactTaxon',
  'calibratedCropProfile',
  'localInputs',
  'pinnedSourceVersion',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function sourcePolicy(value) {
  return deepFreeze({
    registryVersion: REGISTRY_VERSION,
    auditedAt: AUDITED_AT,
    ...value,
  });
}

const GLOBAL_AGRONOMY_SOURCE_REGISTRY = deepFreeze({
  gbif: sourcePolicy({
    id: 'gbif',
    name: 'GBIF Species API and Backbone Taxonomy',
    status: SOURCE_STATUS.APPROVED,
    role: 'identity',
    allowedUses: [SOURCE_USE.IDENTITY],
    priority: 'primary',
    optional: false,
    version: {
      value: 'Species API v1; Species Match v2 when explicitly selected',
      strategy: 'capture-api-and-backbone-version',
    },
    license: {
      id: 'CC-BY-4.0',
      commercialUse: true,
      attributionRequired: true,
      url: 'https://creativecommons.org/licenses/by/4.0/',
      note: 'The taxonomic backbone must be cited; occurrence and media records have their own dataset licenses.',
    },
    provenance: {
      publisher: 'Global Biodiversity Information Facility',
      documentationUrl: 'https://techdocs.gbif.org/en/openapi/v1/species',
      datasetUrl: 'https://doi.org/10.15468/39omei',
      plannedAccess: 'backend-identity-resolution',
    },
    limitations: [
      'Only an accepted species-level exact match may unlock species-specific agronomy.',
      'A fuzzy, candidate, genus or higher-rank match remains unresolved.',
    ],
  }),

  wikipedia: sourcePolicy({
    id: 'wikipedia',
    name: 'Wikipedia species articles',
    status: SOURCE_STATUS.APPROVED,
    role: 'descriptiveEvidence',
    allowedUses: [SOURCE_USE.DESCRIPTIVE_EVIDENCE],
    priority: 'secondary',
    optional: true,
    version: {
      value: 'rolling page revisions',
      strategy: 'capture-page-id-revision-id-and-retrieval-date',
    },
    license: {
      id: 'CC-BY-SA-4.0',
      commercialUse: true,
      attributionRequired: true,
      url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      note: 'Attribute the article and contributors, link the license and revision history, indicate adaptations and preserve ShareAlike for adapted text.',
    },
    provenance: {
      publisher: 'Wikimedia Foundation',
      documentationUrl: 'https://en.wikipedia.org/wiki/Wikipedia:Copyrights',
      datasetUrl: 'https://dumps.wikimedia.org/',
      plannedAccess: 'server-dossier',
    },
    limitations: [
      'Secondary descriptive evidence only; GBIF remains responsible for exact taxonomic identity.',
      'Never use article text for a calculation, recommendation, climate context or soil estimate.',
      'Persist the exact article URL, page and revision identifiers, retrieval time and attribution trail with every excerpt.',
    ],
  }),

  soilgrids: sourcePolicy({
    id: 'soilgrids',
    name: 'ISRIC SoilGrids',
    status: SOURCE_STATUS.APPROVED,
    role: 'soilEstimate',
    allowedUses: [SOURCE_USE.SOIL_ESTIMATE],
    priority: 'primary',
    optional: false,
    version: {
      value: '2.0',
      strategy: 'pin-layer-release-and-retrieval-date',
    },
    license: {
      id: 'CC-BY-4.0',
      commercialUse: true,
      attributionRequired: true,
      url: 'https://creativecommons.org/licenses/by/4.0/',
      note: 'Cite the product, authors, year, DOI or URL and access date.',
    },
    provenance: {
      publisher: 'ISRIC - World Soil Information',
      documentationUrl: 'https://docs.isric.org/globaldata/soilgrids/index.html',
      datasetUrl: 'https://files.isric.org/soilgrids/latest/data/',
      plannedAccess: 'scheduled-wcs-or-webdav-ingestion',
    },
    limitations: [
      'A 250 m model estimate is not a laboratory soil analysis.',
      'Keep quantiles and uncertainty with every value; do not depend on the beta REST service at runtime.',
    ],
  }),

  agera5: sourcePolicy({
    id: 'agera5',
    name: 'Copernicus AgERA5',
    status: SOURCE_STATUS.APPROVED,
    role: 'climateContext',
    allowedUses: [SOURCE_USE.CLIMATE_CONTEXT],
    priority: 'primary',
    optional: false,
    version: {
      value: '2.0',
      strategy: 'pin-dataset-version-and-doi',
    },
    license: {
      id: 'CC-BY-4.0',
      commercialUse: true,
      attributionRequired: true,
      url: 'https://creativecommons.org/licenses/by/4.0/',
      note: 'Retain the Copernicus attribution and the exact dataset DOI.',
    },
    provenance: {
      publisher: 'Copernicus Climate Change Service',
      documentationUrl: 'https://cds.climate.copernicus.eu/datasets/sis-agrometeorological-indicators?tab=overview',
      datasetUrl: 'https://cds.climate.copernicus.eu/datasets/sis-agrometeorological-indicators-timeseries?tab=overview',
      plannedAccess: 'scheduled-cds-ingestion',
    },
    limitations: [
      'Reanalysis and derived indicators are climate context, not field measurements.',
      'Respect documented regional quality notices and cache upstream outages.',
    ],
  }),

  'nasa-power': sourcePolicy({
    id: 'nasa-power',
    name: 'NASA POWER',
    status: SOURCE_STATUS.APPROVED,
    role: 'climateContext',
    allowedUses: [SOURCE_USE.CLIMATE_CONTEXT],
    priority: 'fallback',
    optional: false,
    version: {
      value: 'rolling service',
      strategy: 'capture-service-version-and-retrieval-date',
    },
    license: {
      id: 'NASA-DATA-POLICY',
      commercialUse: true,
      attributionRequired: false,
      url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy',
      note: 'Verify product metadata for exceptions and cite NASA POWER even when attribution is not legally required.',
    },
    provenance: {
      publisher: 'NASA Langley Research Center',
      documentationUrl: 'https://power.larc.nasa.gov/docs/services/api/',
      datasetUrl: 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
      plannedAccess: 'backend-fallback-cache',
    },
    limitations: [
      'Spatial resolution varies by parameter and is coarser than a field.',
      'Near-real-time values can be revised; cache, deduplicate and retain retrieval time.',
    ],
  }),

  aquacrop: sourcePolicy({
    id: 'aquacrop',
    name: 'FAO AquaCrop Open Source',
    status: SOURCE_STATUS.APPROVED,
    role: 'optionalModel',
    allowedUses: [SOURCE_USE.CALCULATION],
    priority: 'optional',
    optional: true,
    version: {
      value: 'not-enabled',
      strategy: 'pin-release-or-commit-before-enabling',
    },
    license: {
      id: 'BSD-3-Clause',
      commercialUse: true,
      attributionRequired: true,
      url: 'https://raw.githubusercontent.com/KUL-RSDA/AquaCrop/master/LICENSE',
      note: 'Keep the copyright and license notices and do not imply endorsement.',
    },
    provenance: {
      publisher: 'FAO AquaCrop and KUL-RSDA',
      documentationUrl: 'https://www.fao.org/aquacrop/overview/input-requirements/en',
      datasetUrl: 'https://github.com/KUL-RSDA/AquaCrop',
      plannedAccess: 'disabled-until-model-profile-audit',
    },
    calculationRequirements: MODEL_CALCULATION_REQUIREMENTS,
    limitations: [
      'Only calibrated supported herbaceous crop profiles may be simulated.',
      'The model does not create a fertilizer recommendation and cannot infer missing local inputs.',
    ],
  }),

  worldclim: sourcePolicy({
    id: 'worldclim',
    name: 'WorldClim 2.1',
    status: SOURCE_STATUS.BLOCKED,
    role: 'climateContext',
    allowedUses: [],
    priority: 'disabled',
    optional: false,
    version: { value: '2.1', strategy: 'blocked' },
    license: {
      id: 'WORLDCLIM-NONCOMMERCIAL',
      commercialUse: false,
      attributionRequired: true,
      url: 'https://worldclim.org/about.html',
      note: 'Commercial use and redistribution require prior permission.',
    },
    provenance: {
      publisher: 'WorldClim',
      documentationUrl: 'https://worldclim.org/data/worldclim21.html',
      datasetUrl: 'https://worldclim.org/data/worldclim21.html',
      plannedAccess: 'disabled',
    },
    limitations: ['The published license is not compatible with the commercial NatureLens app.'],
  }),

  ecocrop: sourcePolicy({
    id: 'ecocrop',
    name: 'FAO EcoCrop',
    status: SOURCE_STATUS.BLOCKED,
    role: 'cropRequirements',
    allowedUses: [],
    priority: 'disabled',
    optional: false,
    version: { value: 'legacy-discontinued', strategy: 'blocked' },
    license: {
      id: 'FAO-WEBSITE-TERMS',
      commercialUse: false,
      attributionRequired: true,
      url: 'https://www.fao.org/contact-us/terms/',
      note: 'No explicit commercial dataset license or supported bulk API was found.',
    },
    provenance: {
      publisher: 'Food and Agriculture Organization of the United Nations',
      documentationUrl: 'https://www.fao.org/land-water/resources/tools/databases/ecocrop/en',
      datasetUrl: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/home',
      plannedAccess: 'disabled',
    },
    limitations: ['The database is discontinued and must not be scraped into a commercial product.'],
  }),

  'gaez-v4': sourcePolicy({
    id: 'gaez-v4',
    name: 'FAO GAEZ v4',
    status: SOURCE_STATUS.BLOCKED,
    role: 'cropSuitability',
    allowedUses: [],
    priority: 'disabled',
    optional: false,
    version: { value: '4', strategy: 'blocked' },
    license: {
      id: 'CC-BY-NC-SA-4.0',
      commercialUse: false,
      attributionRequired: true,
      url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      note: 'The non-commercial condition blocks use in NatureLens.',
    },
    provenance: {
      publisher: 'Food and Agriculture Organization of the United Nations',
      documentationUrl: 'https://www.fao.org/gaez/gaezv4/en',
      datasetUrl: 'https://data.fao.org/catalog/dataset/0d1c713c-37a0-4663-9c75-9fbfe9174132',
      plannedAccess: 'disabled',
    },
    limitations: ['Do not assume the terms of a different GAEZ generation apply to this release.'],
  }),

  faostat: sourcePolicy({
    id: 'faostat',
    name: 'FAOSTAT',
    status: SOURCE_STATUS.QUARANTINED,
    role: 'nationalStatistics',
    allowedUses: [],
    priority: 'legal-review',
    optional: false,
    version: { value: 'rolling by domain', strategy: 'pin-domain-release-and-license' },
    license: {
      id: 'FAO-DATABASE-TERMS-DATASET-SPECIFIC',
      commercialUse: null,
      attributionRequired: true,
      url: 'https://www.fao.org/contact-us/terms/db-terms-of-use/en',
      note: 'The default is CC BY 4.0, but domain metadata and additional FAO restrictions must be reviewed.',
    },
    provenance: {
      publisher: 'Food and Agriculture Organization of the United Nations',
      documentationUrl: 'https://www.fao.org/faostat/en/#developer-portal',
      datasetUrl: 'https://www.fao.org/faostat/en/#data',
      plannedAccess: 'disabled-pending-domain-license-review',
    },
    limitations: ['National commodity statistics cannot become a species or field fertilizer recommendation.'],
  }),

  'gaez-v5': sourcePolicy({
    id: 'gaez-v5',
    name: 'FAO GAEZ v5',
    status: SOURCE_STATUS.QUARANTINED,
    role: 'cropSuitability',
    allowedUses: [],
    priority: 'legal-review',
    optional: false,
    version: { value: '5', strategy: 'pin-layer-version-and-license' },
    license: {
      id: 'UNRESOLVED',
      commercialUse: null,
      attributionRequired: true,
      url: 'https://www.fao.org/gaez/en/',
      note: 'Open access is stated, but an unambiguous commercial reuse license was not found for every layer.',
    },
    provenance: {
      publisher: 'Food and Agriculture Organization of the United Nations',
      documentationUrl: 'https://github.com/un-fao/gaezv5/wiki',
      datasetUrl: 'https://data.apps.fao.org/gaez/?lang=en',
      plannedAccess: 'disabled-pending-layer-license-review',
    },
    limitations: ['Crop codes require an audited exact mapping from scientific names.'],
  }),

  'fao-crop-calendar': sourcePolicy({
    id: 'fao-crop-calendar',
    name: 'FAO Crop Calendar',
    status: SOURCE_STATUS.QUARANTINED,
    role: 'cropCalendar',
    allowedUses: [],
    priority: 'legal-review',
    optional: false,
    version: { value: 'API v1', strategy: 'pin-snapshot-and-license' },
    license: {
      id: 'UNRESOLVED',
      commercialUse: null,
      attributionRequired: true,
      url: 'https://www.fao.org/contact-us/terms/',
      note: 'The public API does not publish an explicit commercial dataset license.',
    },
    provenance: {
      publisher: 'Food and Agriculture Organization of the United Nations',
      documentationUrl: 'https://api-cropcalendar.apps.fao.org/',
      datasetUrl: 'https://api-cropcalendar.apps.fao.org/',
      plannedAccess: 'disabled-pending-written-permission',
    },
    limitations: ['Country and agroecological-zone calendars need an exact audited crop mapping and local context.'],
  }),

  'wapor-v3': sourcePolicy({
    id: 'wapor-v3',
    name: 'FAO WaPOR v3',
    status: SOURCE_STATUS.QUARANTINED,
    role: 'waterProductivityContext',
    allowedUses: [],
    priority: 'legal-review',
    optional: false,
    version: { value: '3', strategy: 'pin-layer-release-and-license' },
    license: {
      id: 'FAO-DATABASE-TERMS-LAYER-SPECIFIC',
      commercialUse: null,
      attributionRequired: true,
      url: 'https://www.fao.org/contact-us/terms/db-terms-of-use/en',
      note: 'Commercial rights and attribution must be confirmed for the exact layer and access channel.',
    },
    provenance: {
      publisher: 'Food and Agriculture Organization of the United Nations',
      documentationUrl: 'https://www.fao.org/in-action/remote-sensing-for-water-productivity/wapor-data/',
      datasetUrl: 'https://www.fao.org/in-action/remote-sensing-for-water-productivity/wapor-data-access/en',
      plannedAccess: 'disabled-pending-layer-license-review',
    },
    limitations: ['Remote-sensing water productivity is location context, not a taxon-specific prescription.'],
  }),
});

const KNOWN_STATUSES = new Set(Object.values(SOURCE_STATUS));
const KNOWN_USES = new Set(Object.values(SOURCE_USE));

function isHttps(value) {
  return typeof value === 'string' && /^https:\/\//.test(value);
}

function validatePolicyRecord(sourceId, policy) {
  if (
    !policy ||
    policy.registryVersion !== REGISTRY_VERSION ||
    policy.auditedAt !== AUDITED_AT ||
    policy.id !== sourceId ||
    typeof policy.name !== 'string' ||
    !policy.name.trim() ||
    !KNOWN_STATUSES.has(policy.status) ||
    typeof policy.role !== 'string' ||
    !policy.role.trim() ||
    typeof policy.priority !== 'string' ||
    !policy.priority.trim() ||
    typeof policy.optional !== 'boolean'
  ) {
    return false;
  }
  if (
    !Array.isArray(policy.allowedUses) ||
    new Set(policy.allowedUses).size !== policy.allowedUses.length ||
    policy.allowedUses.some((use) => !KNOWN_USES.has(use))
  ) {
    return false;
  }
  if (policy.status === SOURCE_STATUS.APPROVED && policy.allowedUses.length === 0) return false;
  if (policy.status !== SOURCE_STATUS.APPROVED && policy.allowedUses.length > 0) return false;
  if (policy.allowedUses.includes(SOURCE_USE.RECOMMENDATION)) return false;
  if (
    policy.allowedUses.includes(SOURCE_USE.CALCULATION) &&
    (!Array.isArray(policy.calculationRequirements) ||
      MODEL_CALCULATION_REQUIREMENTS.some(
        (requirement) => !policy.calculationRequirements.includes(requirement)
      ))
  ) {
    return false;
  }
  if (!policy.version?.value || !policy.version?.strategy) return false;
  if (
    !policy.license?.id ||
    !isHttps(policy.license?.url) ||
    typeof policy.license?.attributionRequired !== 'boolean'
  ) {
    return false;
  }
  if (
    (policy.status === SOURCE_STATUS.APPROVED && policy.license.commercialUse !== true) ||
    (policy.status === SOURCE_STATUS.BLOCKED && policy.license.commercialUse !== false) ||
    (policy.status === SOURCE_STATUS.QUARANTINED && policy.license.commercialUse !== null)
  ) {
    return false;
  }
  if (
    !policy.provenance?.publisher ||
    !isHttps(policy.provenance?.documentationUrl) ||
    !isHttps(policy.provenance?.datasetUrl) ||
    !policy.provenance?.plannedAccess
  ) {
    return false;
  }
  if (
    !Array.isArray(policy.limitations) ||
    policy.limitations.length === 0 ||
    policy.limitations.some((limitation) => typeof limitation !== 'string' || !limitation.trim())
  ) {
    return false;
  }
  return true;
}

for (const [sourceId, policy] of Object.entries(GLOBAL_AGRONOMY_SOURCE_REGISTRY)) {
  if (!validatePolicyRecord(sourceId, policy)) {
    throw new Error(`Invalid global agronomy source policy: ${sourceId}`);
  }
}

function getSourcePolicy(sourceId) {
  if (typeof sourceId !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(GLOBAL_AGRONOMY_SOURCE_REGISTRY, sourceId)
    ? GLOBAL_AGRONOMY_SOURCE_REGISTRY[sourceId]
    : null;
}

function evaluateSourceUse(sourceId, requestedUse, context = {}) {
  const source = getSourcePolicy(sourceId);
  if (!source) return deepFreeze({ allowed: false, reason: 'unknown-source', source: null });
  if (!KNOWN_USES.has(requestedUse)) {
    return deepFreeze({ allowed: false, reason: 'unknown-use', source });
  }
  if (source.status !== SOURCE_STATUS.APPROVED) {
    return deepFreeze({ allowed: false, reason: `source-${source.status}`, source });
  }
  if (!source.allowedUses.includes(requestedUse)) {
    return deepFreeze({ allowed: false, reason: 'use-not-allowed', source });
  }

  if (requestedUse === SOURCE_USE.CALCULATION) {
    const missing = MODEL_CALCULATION_REQUIREMENTS.filter((key) => context?.[key] !== true);
    if (missing.length > 0) {
      return deepFreeze({
        allowed: false,
        reason: 'missing-model-prerequisites',
        missing,
        source,
      });
    }
  }

  return deepFreeze({ allowed: true, reason: 'allowed', source });
}

function isSourceUseAllowed(sourceId, requestedUse, context) {
  return evaluateSourceUse(sourceId, requestedUse, context).allowed;
}

function assertSourceUse(sourceId, requestedUse, context) {
  const decision = evaluateSourceUse(sourceId, requestedUse, context);
  if (decision.allowed) return decision.source;

  // O erro tipado impede que um chamador transforme falha de politica em fallback silencioso.
  const error = new Error(`Global agronomy source use denied: ${decision.reason}`);
  error.code = 'GLOBAL_AGRONOMY_SOURCE_USE_DENIED';
  error.reason = decision.reason;
  error.sourceId = typeof sourceId === 'string' ? sourceId : null;
  error.requestedUse = typeof requestedUse === 'string' ? requestedUse : null;
  error.missing = decision.missing || [];
  throw error;
}

function listSourcePolicies() {
  return Object.values(GLOBAL_AGRONOMY_SOURCE_REGISTRY);
}

module.exports = {
  AUDITED_AT,
  GLOBAL_AGRONOMY_SOURCE_REGISTRY,
  MODEL_CALCULATION_REQUIREMENTS,
  REGISTRY_VERSION,
  SOURCE_STATUS,
  SOURCE_USE,
  assertSourceUse,
  evaluateSourceUse,
  getSourcePolicy,
  isSourceUseAllowed,
  listSourcePolicies,
  validatePolicyRecord,
};
