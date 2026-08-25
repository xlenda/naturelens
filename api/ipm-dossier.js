const SUPPORTED_LANGUAGES = new Set([
  'ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pl',
  'pt', 'sv', 'tr', 'zh', 'zh-hant',
]);

const NO_STORE = 'private, no-store';
const SUCCESS_CACHE = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';

const SOURCES = Object.freeze({
  embrapaMaize: Object.freeze({
    id: 'embrapa-maize',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/milho/producao/pragas-e-doencas/pragas/manejo-integrado-de-pragas',
    license: 'citation-only',
  }),
  embrapaTomato: Object.freeze({
    id: 'embrapa-tomato',
    url: 'https://www.embrapa.br/web/agencia-de-informacao-tecnologica/cultivos/tomate/producao/doencas-e-pragas/pragas/traca-do-tomateiro',
    license: 'citation-only',
  }),
  embrapaSoy: Object.freeze({
    id: 'embrapa-soy',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/soja/producao/manejo-integrado-de-pragas/monitoramento-da-lavoura',
    license: 'citation-only',
  }),
  embrapaMaizeLeafhopper: Object.freeze({
    id: 'embrapa-maize-leafhopper',
    url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1152076/1/DOC-149-2022-ONLINE-1.pdf',
    license: 'citation-only',
  }),
  embrapaBeanWhitefly: Object.freeze({
    id: 'embrapa-bean-whitefly',
    url: 'https://www.atermaisdigital.cnptia.embrapa.br/web/feijao/pragas',
    license: 'citation-only',
  }),
  embrapaCottonBollWeevil: Object.freeze({
    id: 'embrapa-cotton-boll-weevil',
    url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1170739/1/CIRCULAR-TECNICA-143-DR-MIRANDA.pdf',
    license: 'citation-only',
  }),
  embrapaCoffeeBerryBorer: Object.freeze({
    id: 'embrapa-coffee-berry-borer',
    url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1167902/1/Circular-Tecnica-8-Manejo-integrado-de-pragas.pdf',
    license: 'citation-only',
  }),
  embrapaSoyLooper: Object.freeze({
    id: 'embrapa-soy-looper',
    url: 'https://ainfo.cnptia.embrapa.br/digital/bitstream/item/219418/1/p.-197-226-de-SP-17-2020-online.pdf',
    license: 'citation-only',
  }),
  embrapaSoyCaterpillar: Object.freeze({
    id: 'embrapa-soy-caterpillar',
    url: 'https://www.embrapa.br/web/agencia-de-informacao-tecnologica/cultivos/soja/producao/manejo-integrado-de-pragas/pragas/pragas-que-atacam-folhas/lagarta-da-soja',
    license: 'citation-only',
  }),
  agrofit: Object.freeze({
    id: 'agrofit',
    url: 'https://www.gov.br/agricultura/pt-br/assuntos/insumos-agropecuarios/insumos-agricolas/agrotoxicos/agrofit',
    license: 'CC-BY-ND-3.0',
  }),
});

// Cada entrada e uma intersecao publicada. A especie sozinha nunca autoriza
// copiar o manejo para outra cultura, e a cultura sozinha nao prova a praga.
const PAIRS = Object.freeze({
  'Spodoptera frugiperda|Zea mays': Object.freeze({
    pairId: 'fall-armyworm-maize-v1',
    prevention: Object.freeze(['preserveNaturalEnemies', 'avoidCalendarSprays']),
    monitoring: Object.freeze(['inspectWhorl', 'confirmDamageAndStage', 'sampleRepresentativePoints']),
    thresholds: Object.freeze([
      Object.freeze({
        id: 'initial-symptoms-high-yield',
        labelKey: 'initialSymptomsHighYieldThreshold',
        samplePoints: 5,
        sampleAreaHa: 1,
        actionPercent: 10,
        minimumYieldBagsPerHa: 100,
      }),
    ]),
    controls: Object.freeze({
      cultural: Object.freeze(['removeVolunteerHosts', 'manageCropResidue']),
      mechanical: Object.freeze(['removeEggMassesSmallPlots']),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
    sources: Object.freeze([SOURCES.embrapaMaize, SOURCES.agrofit]),
  }),
  'Tuta absoluta|Solanum lycopersicum': Object.freeze({
    pairId: 'tomato-leafminer-tomato-v1',
    prevention: Object.freeze(['inspectTransplants', 'protectNursery', 'manageCropResidue']),
    monitoring: Object.freeze(['inspectLeafMines', 'inspectFruitDamage', 'usePheromoneTraps']),
    thresholds: Object.freeze([]),
    controls: Object.freeze({
      cultural: Object.freeze(['removeInfestedTissue', 'manageCropResidue', 'rotateOutsideHostFamily']),
      mechanical: Object.freeze(['useInsectScreens', 'usePheromoneTraps']),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
    sources: Object.freeze([SOURCES.embrapaTomato, SOURCES.agrofit]),
  }),
  'Euschistus heros|Glycine max': Object.freeze({
    pairId: 'brown-stinkbug-soy-v1',
    prevention: Object.freeze(['preserveNaturalEnemies', 'avoidCalendarSprays']),
    monitoring: Object.freeze(['useBeatCloth', 'sampleCoolHours', 'recordCropStage']),
    // A referencia oficial e para o complexo de percevejos; nao e um limiar
    // exclusivo de E. heros. Por isso nenhum numero aparece neste par exato.
    thresholds: Object.freeze([]),
    controls: Object.freeze({
      cultural: Object.freeze(['manageCropResidue', 'removeVolunteerHosts']),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
    sources: Object.freeze([SOURCES.embrapaSoy, SOURCES.agrofit]),
  }),
  'Dalbulus maidis|Zea mays': Object.freeze({
    pairId: 'corn-leafhopper-maize-v1',
    prevention: Object.freeze(['removeVolunteerHosts', 'avoidStaggeredPlanting', 'avoidOlderMaizeNearby']),
    monitoring: Object.freeze(['inspectWhorl', 'recordCropStage', 'sampleRepresentativePoints']),
    thresholds: Object.freeze([]),
    controls: Object.freeze({
      cultural: Object.freeze(['removeVolunteerHosts', 'avoidStaggeredPlanting', 'avoidOlderMaizeNearby']),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
    sources: Object.freeze([SOURCES.embrapaMaizeLeafhopper, SOURCES.agrofit]),
  }),
  'Bemisia tabaci|Phaseolus vulgaris': Object.freeze({
    pairId: 'whitefly-common-bean-v1',
    prevention: Object.freeze(['avoidStaggeredPlanting', 'removeAlternateHosts']),
    monitoring: Object.freeze(['confirmDamageAndStage']),
    thresholds: Object.freeze([]),
    controls: Object.freeze({
      cultural: Object.freeze(['avoidStaggeredPlanting', 'removeAlternateHosts']),
      mechanical: Object.freeze([]),
      biological: Object.freeze([]),
    }),
    sources: Object.freeze([SOURCES.embrapaBeanWhitefly, SOURCES.agrofit]),
  }),
  'Anthonomus grandis|Gossypium hirsutum': Object.freeze({
    pairId: 'boll-weevil-upland-cotton-v1',
    prevention: Object.freeze(['removeVolunteerHosts', 'manageCropResidue']),
    monitoring: Object.freeze(['inspectFieldEdges', 'inspectFlowerBuds', 'recordCropStage']),
    thresholds: Object.freeze([]),
    controls: Object.freeze({
      cultural: Object.freeze(['manageCropResidue', 'removeVolunteerHosts']),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
    sources: Object.freeze([SOURCES.embrapaCottonBollWeevil, SOURCES.agrofit]),
  }),
  'Hypothenemus hampei|Coffea arabica': Object.freeze({
    pairId: 'coffee-berry-borer-arabica-v1',
    prevention: Object.freeze(['completeSanitaryHarvest']),
    monitoring: Object.freeze(['inspectFruitDamage', 'sampleRepresentativePoints', 'recordCropStage']),
    thresholds: Object.freeze([]),
    controls: Object.freeze({
      cultural: Object.freeze(['completeSanitaryHarvest']),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['checkRegisteredBiocontrol']),
    }),
    sources: Object.freeze([SOURCES.embrapaCoffeeBerryBorer, SOURCES.agrofit]),
  }),
  'Chrysodeixis includens|Glycine max': Object.freeze({
    pairId: 'soybean-looper-soy-v1',
    prevention: Object.freeze(['avoidCalendarSprays', 'preserveNaturalEnemies']),
    monitoring: Object.freeze(['useBeatCloth', 'inspectLowerCanopy', 'confirmDamageAndStage', 'recordCropStage', 'sampleRepresentativePoints']),
    thresholds: Object.freeze([]),
    controls: Object.freeze({
      cultural: Object.freeze([]),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
    sources: Object.freeze([SOURCES.embrapaSoyLooper, SOURCES.agrofit]),
  }),
  'Anticarsia gemmatalis|Glycine max': Object.freeze({
    pairId: 'velvetbean-caterpillar-soy-v1',
    prevention: Object.freeze(['avoidCalendarSprays', 'preserveNaturalEnemies']),
    monitoring: Object.freeze(['useBeatCloth', 'confirmDamageAndStage', 'recordCropStage', 'sampleRepresentativePoints']),
    // A pagina descreve a especie e o dano, mas nenhum numero e publicado
    // aqui como limiar exclusivo do par. O app, portanto, nao inventa um.
    thresholds: Object.freeze([]),
    controls: Object.freeze({
      cultural: Object.freeze([]),
      mechanical: Object.freeze([]),
      biological: Object.freeze(['preserveNaturalEnemies', 'checkRegisteredBiocontrol']),
    }),
    sources: Object.freeze([SOURCES.embrapaSoyCaterpillar, SOURCES.agrofit]),
  }),
});

function single(value) {
  return typeof value === 'string' ? value : null;
}

function scientific(value) {
  const clean = single(value)?.trim().normalize('NFC');
  return clean && /^\p{Lu}[\p{L}-]{1,63} \p{Ll}[\p{L}-]{1,63}$/u.test(clean)
    ? clean
    : null;
}

function language(value) {
  const raw = single(value)?.trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return null;
  if (SUPPORTED_LANGUAGES.has(raw)) return raw;
  if (['zh-tw', 'zh-hk', 'zh-mo'].includes(raw)) return 'zh-hant';
  if (['zh-cn', 'zh-sg', 'zh-hans'].includes(raw)) return 'zh';
  const primary = raw.split('-')[0];
  return SUPPORTED_LANGUAGES.has(primary) ? primary : null;
}

function supportedCrops(insectScientific) {
  const insect = scientific(insectScientific);
  if (!insect) return [];
  return Object.keys(PAIRS)
    .map((key) => key.split('|'))
    .filter(([candidate]) => candidate === insect)
    .map(([, crop]) => crop);
}

function exactProfile(insectScientific, cropScientific) {
  const insect = scientific(insectScientific);
  const crop = scientific(cropScientific);
  if (!insect || !crop) return null;
  const profile = PAIRS[`${insect}|${crop}`];
  if (!profile) return null;
  return {
    insectScientific: insect,
    cropScientific: crop,
    pairId: profile.pairId,
    prevention: profile.prevention,
    monitoring: profile.monitoring,
    thresholds: profile.thresholds,
    controls: profile.controls,
    chemical: { type: 'label-referral', registryId: 'agrofit' },
    sources: profile.sources,
  };
}

function send(res, status, body, cache = NO_STORE) {
  res.setHeader('Cache-Control', cache);
  res.status(status).json(body);
}

async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', NO_STORE);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    send(res, 405, { error: 'method_not_allowed' });
    return;
  }

  const insect = scientific(req.query?.insectScientific);
  const locale = language(req.query?.language);
  if (!insect || !locale) {
    send(res, 400, { error: 'invalid_request' });
    return;
  }

  const cropInput = single(req.query?.cropScientific);
  if (!cropInput) {
    send(res, 200, { insectScientific: insect, crops: supportedCrops(insect) }, SUCCESS_CACHE);
    return;
  }

  const profile = exactProfile(insect, cropInput);
  if (!profile) {
    send(res, 404, { error: 'pair_not_verified' }, SUCCESS_CACHE);
    return;
  }
  send(res, 200, profile, SUCCESS_CACHE);
}

module.exports = handler;
module.exports.PAIRS = PAIRS;
module.exports.SOURCES = SOURCES;
module.exports.exactProfile = exactProfile;
module.exports.language = language;
module.exports.scientific = scientific;
module.exports.supportedCrops = supportedCrops;
