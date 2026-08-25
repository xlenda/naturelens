const ACTIONS = new Set([
  'avoidOlderMaizeNearby',
  'avoidStaggeredPlanting',
  'avoidCalendarSprays',
  'checkRegisteredBiocontrol',
  'completeSanitaryHarvest',
  'confirmDamageAndStage',
  'inspectFieldEdges',
  'inspectFlowerBuds',
  'inspectFruitDamage',
  'inspectLeafMines',
  'inspectLowerCanopy',
  'inspectTransplants',
  'inspectWhorl',
  'manageCropResidue',
  'preserveNaturalEnemies',
  'protectNursery',
  'recordCropStage',
  'removeAlternateHosts',
  'removeEggMassesSmallPlots',
  'removeInfestedTissue',
  'removeVolunteerHosts',
  'rotateOutsideHostFamily',
  'sampleCoolHours',
  'sampleRepresentativePoints',
  'useBeatCloth',
  'useInsectScreens',
  'usePheromoneTraps',
]);

const CROPS = new Set([
  'Coffea arabica', 'Glycine max', 'Gossypium hirsutum', 'Phaseolus vulgaris',
  'Solanum lycopersicum', 'Zea mays',
]);
const SOURCE_CONTRACTS = Object.freeze({
  'embrapa-maize': {
    host: 'www.embrapa.br',
    path: '/agencia-de-informacao-tecnologica/cultivos/milho/',
    license: 'citation-only',
  },
  'embrapa-tomato': {
    host: 'www.embrapa.br',
    path: '/web/agencia-de-informacao-tecnologica/cultivos/tomate/',
    license: 'citation-only',
  },
  'embrapa-soy': {
    host: 'www.embrapa.br',
    path: '/agencia-de-informacao-tecnologica/cultivos/soja/',
    license: 'citation-only',
  },
  'embrapa-maize-leafhopper': {
    host: 'www.infoteca.cnptia.embrapa.br',
    path: '/infoteca/bitstream/doc/1152076/1/',
    license: 'citation-only',
  },
  'embrapa-bean-whitefly': {
    host: 'www.atermaisdigital.cnptia.embrapa.br',
    path: '/web/feijao/pragas',
    license: 'citation-only',
  },
  'embrapa-cotton-boll-weevil': {
    host: 'www.infoteca.cnptia.embrapa.br',
    path: '/infoteca/bitstream/doc/1170739/1/',
    license: 'citation-only',
  },
  'embrapa-coffee-berry-borer': {
    host: 'www.infoteca.cnptia.embrapa.br',
    path: '/infoteca/bitstream/doc/1167902/1/',
    license: 'citation-only',
  },
  'embrapa-soy-looper': {
    host: 'ainfo.cnptia.embrapa.br',
    path: '/digital/bitstream/item/219418/1/',
    license: 'citation-only',
  },
  'embrapa-soy-caterpillar': {
    host: 'www.embrapa.br',
    path: '/web/agencia-de-informacao-tecnologica/cultivos/soja/',
    license: 'citation-only',
  },
  agrofit: {
    host: 'www.gov.br',
    path: '/agricultura/',
    license: 'CC-BY-ND-3.0',
  },
});
const PAIR_CONTRACTS = Object.freeze({
  'Spodoptera frugiperda|Zea mays': Object.freeze({
    pairId: 'fall-armyworm-maize-v1',
    requiredSources: Object.freeze(['embrapa-maize', 'agrofit']),
    thresholdSource: 'embrapa-maize',
    actions: Object.freeze({
      prevention: Object.freeze(['preserveNaturalEnemies', 'avoidCalendarSprays']),
      monitoring: Object.freeze(['inspectWhorl', 'confirmDamageAndStage', 'sampleRepresentativePoints']),
      cultural: Object.freeze(['removeVolunteerHosts', 'manageCropResidue']),
      mechanical: Object.freeze(['removeEggMassesSmallPlots']),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
  }),
  'Tuta absoluta|Solanum lycopersicum': Object.freeze({
    pairId: 'tomato-leafminer-tomato-v1',
    requiredSources: Object.freeze(['embrapa-tomato', 'agrofit']),
    thresholdSource: null,
    actions: Object.freeze({
      prevention: Object.freeze(['inspectTransplants', 'protectNursery', 'manageCropResidue']),
      monitoring: Object.freeze(['inspectLeafMines', 'inspectFruitDamage', 'usePheromoneTraps']),
      cultural: Object.freeze(['removeInfestedTissue', 'manageCropResidue', 'rotateOutsideHostFamily']),
      mechanical: Object.freeze(['useInsectScreens', 'usePheromoneTraps']),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
  }),
  'Euschistus heros|Glycine max': Object.freeze({
    pairId: 'brown-stinkbug-soy-v1',
    requiredSources: Object.freeze(['embrapa-soy', 'agrofit']),
    thresholdSource: null,
    actions: Object.freeze({
      prevention: Object.freeze(['preserveNaturalEnemies', 'avoidCalendarSprays']),
      monitoring: Object.freeze(['useBeatCloth', 'sampleCoolHours', 'recordCropStage']),
      cultural: Object.freeze(['manageCropResidue', 'removeVolunteerHosts']),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
  }),
  'Dalbulus maidis|Zea mays': Object.freeze({
    pairId: 'corn-leafhopper-maize-v1',
    requiredSources: Object.freeze(['embrapa-maize-leafhopper', 'agrofit']),
    thresholdSource: null,
    actions: Object.freeze({
      prevention: Object.freeze(['removeVolunteerHosts', 'avoidStaggeredPlanting', 'avoidOlderMaizeNearby']),
      monitoring: Object.freeze(['inspectWhorl', 'recordCropStage', 'sampleRepresentativePoints']),
      cultural: Object.freeze(['removeVolunteerHosts', 'avoidStaggeredPlanting', 'avoidOlderMaizeNearby']),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
  }),
  'Bemisia tabaci|Phaseolus vulgaris': Object.freeze({
    pairId: 'whitefly-common-bean-v1',
    requiredSources: Object.freeze(['embrapa-bean-whitefly', 'agrofit']),
    thresholdSource: null,
    actions: Object.freeze({
      prevention: Object.freeze(['avoidStaggeredPlanting', 'removeAlternateHosts']),
      monitoring: Object.freeze(['confirmDamageAndStage']),
      cultural: Object.freeze(['avoidStaggeredPlanting', 'removeAlternateHosts']),
      mechanical: Object.freeze([]),
      biological: Object.freeze([]),
    }),
  }),
  'Anthonomus grandis|Gossypium hirsutum': Object.freeze({
    pairId: 'boll-weevil-upland-cotton-v1',
    requiredSources: Object.freeze(['embrapa-cotton-boll-weevil', 'agrofit']),
    thresholdSource: null,
    actions: Object.freeze({
      prevention: Object.freeze(['removeVolunteerHosts', 'manageCropResidue']),
      monitoring: Object.freeze(['inspectFieldEdges', 'inspectFlowerBuds', 'recordCropStage']),
      cultural: Object.freeze(['manageCropResidue', 'removeVolunteerHosts']),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
  }),
  'Hypothenemus hampei|Coffea arabica': Object.freeze({
    pairId: 'coffee-berry-borer-arabica-v1',
    requiredSources: Object.freeze(['embrapa-coffee-berry-borer', 'agrofit']),
    thresholdSource: null,
    actions: Object.freeze({
      prevention: Object.freeze(['completeSanitaryHarvest']),
      monitoring: Object.freeze(['inspectFruitDamage', 'sampleRepresentativePoints', 'recordCropStage']),
      cultural: Object.freeze(['completeSanitaryHarvest']),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['checkRegisteredBiocontrol']),
    }),
  }),
  'Chrysodeixis includens|Glycine max': Object.freeze({
    pairId: 'soybean-looper-soy-v1',
    requiredSources: Object.freeze(['embrapa-soy-looper', 'agrofit']),
    thresholdSource: null,
    actions: Object.freeze({
      prevention: Object.freeze(['avoidCalendarSprays', 'preserveNaturalEnemies']),
      monitoring: Object.freeze(['useBeatCloth', 'inspectLowerCanopy', 'confirmDamageAndStage', 'recordCropStage', 'sampleRepresentativePoints']),
      cultural: Object.freeze([]),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
  }),
  'Anticarsia gemmatalis|Glycine max': Object.freeze({
    pairId: 'velvetbean-caterpillar-soy-v1',
    requiredSources: Object.freeze(['embrapa-soy-caterpillar', 'agrofit']),
    thresholdSource: null,
    actions: Object.freeze({
      prevention: Object.freeze(['avoidCalendarSprays', 'preserveNaturalEnemies']),
      monitoring: Object.freeze(['useBeatCloth', 'confirmDamageAndStage', 'recordCropStage', 'sampleRepresentativePoints']),
      cultural: Object.freeze([]),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
  }),
});

const memoryCache = new Map();
const inflight = new Map();
const REQUEST_TIMEOUT_MS = 5000;

function cleanScientific(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().normalize('NFC');
  return /^\p{Lu}[\p{L}-]{1,63} \p{Ll}[\p{L}-]{1,63}$/u.test(clean) ? clean : null;
}

function cleanLanguage(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase().replace(/_/g, '-');
  return /^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(clean) ? clean : null;
}

function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanActions(value, allowed = ACTIONS) {
  if (!Array.isArray(value)) return [];
  const contract = allowed instanceof Set ? allowed : new Set(allowed);
  return [...new Set(value.filter((item) => typeof item === 'string' && ACTIONS.has(item) && contract.has(item)))];
}

function cleanSource(value) {
  if (!plain(value)) return null;
  const contract = SOURCE_CONTRACTS[value.id];
  if (!contract || value.license !== contract.license || typeof value.url !== 'string') return null;
  try {
    const url = new URL(value.url);
    if (url.protocol !== 'https:' || url.hostname !== contract.host || !url.pathname.startsWith(contract.path)) {
      return null;
    }
    return { id: value.id, url: url.toString(), license: value.license };
  } catch {
    return null;
  }
}

function cleanThresholds(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!plain(item) || item.id !== 'initial-symptoms-high-yield'
      || item.labelKey !== 'initialSymptomsHighYieldThreshold') return [];
    if (item.samplePoints !== 5 || item.sampleAreaHa !== 1 || item.actionPercent !== 10
      || item.minimumYieldBagsPerHa !== 100) return [];
    return [{
      id: item.id,
      labelKey: item.labelKey,
      samplePoints: item.samplePoints,
      sampleAreaHa: item.sampleAreaHa,
      actionPercent: item.actionPercent,
      minimumYieldBagsPerHa: item.minimumYieldBagsPerHa,
    }];
  });
}

function normaliseCropList(value, expectedInsect) {
  const insect = cleanScientific(expectedInsect);
  if (!plain(value) || cleanScientific(value.insectScientific) !== insect) return null;
  if (!Array.isArray(value.crops)) return null;
  const verifiedCrops = new Set(Object.keys(PAIR_CONTRACTS)
    .map((pair) => pair.split('|'))
    .filter(([candidate]) => candidate === insect)
    .map(([, crop]) => crop));
  return [...new Set(value.crops.map(cleanScientific)
    .filter((crop) => crop && CROPS.has(crop) && verifiedCrops.has(crop)))];
}

function normaliseIpmDossier(value, expectedInsect, expectedCrop) {
  if (!plain(value)) return null;
  const insectScientific = cleanScientific(value.insectScientific);
  const cropScientific = cleanScientific(value.cropScientific);
  if (insectScientific !== cleanScientific(expectedInsect) || cropScientific !== cleanScientific(expectedCrop)) return null;
  const pairContract = PAIR_CONTRACTS[`${insectScientific}|${cropScientific}`];
  if (!pairContract || value.pairId !== pairContract.pairId) return null;

  const prevention = cleanActions(value.prevention, pairContract.actions.prevention);
  const monitoring = cleanActions(value.monitoring, pairContract.actions.monitoring);
  const controls = plain(value.controls) ? {
    cultural: cleanActions(value.controls.cultural, pairContract.actions.cultural),
    mechanical: cleanActions(value.controls.mechanical, pairContract.actions.mechanical),
    biological: cleanActions(value.controls.biological, pairContract.actions.biological),
  } : { cultural: [], mechanical: [], biological: [] };
  const allowedSources = new Set(pairContract.requiredSources);
  const sources = Array.isArray(value.sources)
    ? value.sources.map(cleanSource).filter((source) => source && allowedSources.has(source.id))
      .filter((source, index, all) => all.findIndex((candidate) => candidate.id === source.id) === index)
    : [];
  const sourceIds = new Set(sources.map((source) => source.id));
  if (pairContract.requiredSources.some((id) => !sourceIds.has(id))) return null;
  // Numero e sua publicacao viajam juntos. Um proxy parcial ou resposta
  // adulterada nunca pode atribuir o limiar agronomico ao Agrofit.
  const thresholds = pairContract.thresholdSource && sourceIds.has(pairContract.thresholdSource)
    ? cleanThresholds(value.thresholds)
    : [];
  const chemical = value.chemical?.type === 'label-referral' && value.chemical?.registryId === 'agrofit'
    ? { type: 'label-referral', registryId: 'agrofit' }
    : null;

  if (!sources.length || (!prevention.length && !monitoring.length && !thresholds.length
    && !controls.cultural.length && !controls.mechanical.length && !controls.biological.length)) return null;

  return {
    insectScientific,
    cropScientific,
    pairId: value.pairId,
    prevention,
    monitoring,
    thresholds,
    controls,
    chemical,
    sources,
  };
}

function endpoint(apiBase, insectScientific, language, cropScientific) {
  const base = typeof apiBase === 'string' ? apiBase.replace(/\/$/, '') : '';
  let url = `${base}/api/ipm-dossier?insectScientific=${encodeURIComponent(insectScientific)}`
    + `&language=${encodeURIComponent(language)}`;
  if (cropScientific) url += `&cropScientific=${encodeURIComponent(cropScientific)}`;
  return url;
}

async function requestJson(url, fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer;
  const request = fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('ipm_timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function getCached(key, loader) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  if (inflight.has(key)) return inflight.get(key);
  const pending = loader().then((value) => {
    if (value !== undefined) memoryCache.set(key, value);
    return value ?? null;
  }).catch(() => null).finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

async function getSupportedIpmCrops({ apiBase = '', insectScientific, language, fetchImpl } = {}) {
  const insect = cleanScientific(insectScientific);
  const locale = cleanLanguage(language);
  const request = typeof fetchImpl === 'function' ? fetchImpl : global.fetch;
  if (!insect || !locale || typeof request !== 'function') return null;
  return getCached(`crops:${insect}:${locale}`, async () => {
    const response = await requestJson(endpoint(apiBase, insect, locale), request);
    // Falha transitoria nao vira ausencia autoritativa no cache da sessao.
    // Uma lista vazia validada em 200 continua sendo um resultado estavel.
    if (!response?.ok) return undefined;
    const crops = normaliseCropList(await response.json(), insect);
    return crops === null ? undefined : crops;
  });
}

async function getIpmDossier({ apiBase = '', insectScientific, cropScientific, language, fetchImpl } = {}) {
  const insect = cleanScientific(insectScientific);
  const crop = cleanScientific(cropScientific);
  const locale = cleanLanguage(language);
  const request = typeof fetchImpl === 'function' ? fetchImpl : global.fetch;
  if (!insect || !crop || !locale || typeof request !== 'function') return null;
  return getCached(`profile:${insect}:${crop}:${locale}`, async () => {
    const response = await requestJson(endpoint(apiBase, insect, locale, crop), request);
    if (response?.status === 404) return null;
    if (!response?.ok) return undefined;
    return normaliseIpmDossier(await response.json(), insect, crop);
  });
}

function clearIpmCache() {
  memoryCache.clear();
  inflight.clear();
}

module.exports = {
  ACTIONS,
  clearIpmCache,
  endpoint,
  getIpmDossier,
  getSupportedIpmCrops,
  normaliseCropList,
  normaliseIpmDossier,
  requestJson,
};
