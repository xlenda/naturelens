// Registro de cobertura, nao banco de recomendacoes. Cada entrada declara o
// que existe hoje e o que ainda precisa de curadoria para aquele binomio.
// Familia, genero e nome popular nunca entram no lookup: esse limite impede
// que uma tabela correta para milho apareca em cana, trigo ou sorgo.

export const CROP_AGRONOMY_SOURCES = Object.freeze({
  embrapaMaizePlanning: Object.freeze({
    label: 'Embrapa Milho e Sorgo - planejamento da adubacao e calagem',
    url: 'https://www.embrapa.br/web/agencia-de-informacao-tecnologica/cultivos/milho/producao/manejo-do-solo-e-adubacao/adubacao-e-fertilidade-do-solo/planejamento-da-adubacao-e-calagem',
  }),
  embrapaMaizeNutrition: Object.freeze({
    label: 'Embrapa Milho e Sorgo - exigencias nutricionais do milho',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/milho/producao/manejo-do-solo-e-adubacao/adubacao-e-fertilidade-do-solo/exigencias-nutricionais-da-planta',
  }),
  embrapaMaizeMip: Object.freeze({
    label: 'Embrapa Milho e Sorgo - manejo integrado de pragas',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/milho/producao/pragas-e-doencas/pragas/manejo-integrado-de-pragas',
  }),
  embrapaMaizePests: Object.freeze({
    label: 'Embrapa Milho e Sorgo - pragas vegetativas e reprodutivas',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/milho/producao/pragas-e-doencas/pragas/pragas-da-fase-vegetativa-e-reprodutiva',
  }),
  embrapaSoyMonitoring: Object.freeze({
    label: 'Embrapa Soja - monitoramento da lavoura',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/soja/producao/manejo-integrado-de-pragas/monitoramento-da-lavoura',
  }),
  embrapaSoyThresholds: Object.freeze({
    label: 'Embrapa Soja - 500 perguntas, 500 respostas',
    url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1118408/2/500PERGUNTASSojaed012019.pdf',
  }),
  embrapaRiceNutrition: Object.freeze({
    label: 'Embrapa Arroz e Feijao - desordens nutricionais do arroz',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/arroz/pre-producao/desordens-nutricionais',
  }),
  embrapaOnionNutrition: Object.freeze({
    label: 'Embrapa Hortalicas - deficiencias nutricionais da cebola',
    url: 'https://www.embrapa.br/hortalicas/cebola/deficiencias-nutricionais',
  }),
  embrapaTomatoPests: Object.freeze({
    label: 'Embrapa Hortalicas - pragas do tomate de mesa',
    url: 'https://www.embrapa.br/hortalicas/tomate-de-mesa/pragas',
  }),
  embrapaTomatoMoth: Object.freeze({
    label: 'Embrapa Hortalicas - traca-do-tomateiro',
    url: 'https://www.embrapa.br/web/agencia-de-informacao-tecnologica/cultivos/tomate/producao/doencas-e-pragas/pragas/traca-do-tomateiro',
  }),
  embrapaCassavaSemiaridSystem: Object.freeze({
    label: 'Embrapa - sistema de producao de mandioca no Semiarido',
    url: 'https://www.embrapa.br/en/web/mandioca-e-fruticultura/busca-de-solucoes-tecnologicas/-/produto-servico/9825/production-system-for-cassava-in-the-semiarid-region',
  }),
  embrapaCoffeeGoodPracticesMg: Object.freeze({
    label: 'Embrapa Cafe - boas praticas para Coffea arabica em Minas Gerais',
    url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/1148365?locale=pt_BR',
  }),
  embrapaSugarcaneProduction: Object.freeze({
    label: 'Embrapa - producao de cana-de-acucar',
    url: 'https://www.embrapa.br/en/web/agencia-de-informacao-tecnologica/cultivos/cana-de-acucar/producao',
  }),
  embrapaWheatCultivation: Object.freeze({
    label: 'Embrapa Trigo - cultivo de trigo',
    url: 'https://www.embrapa.br/en/web/trigo/busca-de-publicacoes/-/publicacao/1155370/cultivo-de-trigo',
  }),
  embrapaPotatoSystem: Object.freeze({
    label: 'Embrapa Hortalicas - sistema de producao da batata',
    url: 'https://www.infoteca.cnptia.embrapa.br/handle/doc/1028425',
  }),
  embrapaBananaProduction: Object.freeze({
    label: 'Embrapa - producao de banana',
    url: 'https://www.embrapa.br/web/agencia-de-informacao-tecnologica/cultivos/banana/producao',
  }),
  embrapaSeedlessCitrusSystem: Object.freeze({
    label: 'Embrapa - cultivo de citros sem sementes',
    url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/932396',
  }),
  embrapaCommonBeanCentralBrazil: Object.freeze({
    label: 'Embrapa - cultivo do feijoeiro-comum na Regiao Central Brasileira',
    url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/926285?locale=pt_BR',
  }),
  embrapaCottonProductionSystems: Object.freeze({
    label: 'Embrapa Algodao - sistemas de producao',
    url: 'https://www.embrapa.br/en/web/algodao/publicacoes-e-biblioteca/sistemas-de-producao',
  }),
  embrapaTomatoFertilization: Object.freeze({
    label: 'Embrapa Hortalicas - adubacao do tomate de mesa',
    url: 'https://www.embrapa.br/hortalicas/tomate-de-mesa/adubacao',
  }),
  embrapaLettuceDfSystem: Object.freeze({
    label: 'Embrapa - sistema de producao para alface no Distrito Federal',
    url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/905668',
  }),
  embrapaAgritec: Object.freeze({
    label: 'Embrapa AgroAPI - Agritec',
    url: 'https://www.portal.agroapi.cnptia.embrapa.br/api-docs/agritec',
  }),
  mapaZarc: Object.freeze({
    label: 'MAPA - Zoneamento Agricola de Risco Climatico',
    url: 'https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/zoneamento-agricola',
  }),
  mapaAgrofit: Object.freeze({
    label: 'MAPA - Agrofit',
    url: 'https://www.gov.br/agricultura/pt-br/assuntos/insumos-agropecuarios/insumos-agricolas/agrotoxicos/agrofit',
  }),
});

export const CROP_AGRONOMY_MODULES = Object.freeze({
  curatedBasic: 'curatedBasic',
  vendorOverview: 'vendorOverview',
  vendorDiseaseAssessment: 'vendorDiseaseAssessment',
  fertilizerExtraction: 'fertilizerExtraction',
  nutrientExcessGuide: 'nutrientExcessGuide',
  nutrientDiagnosis: 'nutrientDiagnosis',
  pestMonitoring: 'pestMonitoring',
  phenology: 'phenology',
  soilClimate: 'soilClimate',
  fertilityPlan: 'fertilityPlan',
  irrigationPlan: 'irrigationPlan',
  integratedPestManagement: 'integratedPestManagement',
  diseaseGuide: 'diseaseGuide',
  harvestPostharvest: 'harvestPostharvest',
});

const CONDITIONAL_VENDOR_MODULES = Object.freeze([
  CROP_AGRONOMY_MODULES.vendorOverview,
  CROP_AGRONOMY_MODULES.vendorDiseaseAssessment,
]);

const COMPLETE_DOSSIER_MODULES = Object.freeze([
  CROP_AGRONOMY_MODULES.phenology,
  CROP_AGRONOMY_MODULES.soilClimate,
  CROP_AGRONOMY_MODULES.nutrientDiagnosis,
  CROP_AGRONOMY_MODULES.fertilityPlan,
  CROP_AGRONOMY_MODULES.irrigationPlan,
  CROP_AGRONOMY_MODULES.integratedPestManagement,
  CROP_AGRONOMY_MODULES.diseaseGuide,
  CROP_AGRONOMY_MODULES.harvestPostharvest,
]);

const ANNUAL_FIELD_CONTEXTS = Object.freeze([
  'region',
  'productionSystem',
  'cropStage',
  'fieldArea',
  'soilAnalysis',
  'yieldGoal',
  'waterAvailability',
]);

const HORTICULTURE_CONTEXTS = Object.freeze([
  'region',
  'productionSystem',
  'cropStage',
  'fieldArea',
  'soilAnalysis',
  'yieldGoal',
  'irrigationSystem',
]);

const PERENNIAL_CONTEXTS = Object.freeze([
  'region',
  'productionSystem',
  'cropStage',
  'plantAge',
  'soilAnalysis',
  'yieldGoal',
  'waterAvailability',
]);

const ROOT_CROP_CONTEXTS = Object.freeze([
  'region',
  'productionSystem',
  'cropStage',
  'fieldArea',
  'soilAnalysis',
  'yieldGoal',
  'irrigationSystem',
]);

const frozenList = (values) => Object.freeze([...(values || [])]);

const sourceRef = (sourceId, supports) => Object.freeze({
  sourceId,
  supports: frozenList(supports),
});

function profile({
  key,
  scientific,
  exactAliases = [],
  catalogId = null,
  discoverCatalog = false,
  agronomyRouting = 'planned',
  expansionPriority = false,
  purposes,
  requiredContexts,
  currentModules = [],
  sourceRefs = [],
}) {
  const hasCuratedBasic = currentModules.includes(CROP_AGRONOMY_MODULES.curatedBasic);
  return Object.freeze({
    key,
    scientific,
    exactAliases: frozenList(exactAliases),
    catalogId,
    exposure: Object.freeze({
      discoverCatalog,
      agronomyRouting,
      expansionPriority,
    }),
    purposes: frozenList(purposes),
    requiredContexts: frozenList(requiredContexts),
    modules: Object.freeze({
      current: frozenList(currentModules),
      conditional: CONDITIONAL_VENDOR_MODULES,
      planned: frozenList([
        ...(hasCuratedBasic ? [] : [CROP_AGRONOMY_MODULES.curatedBasic]),
        ...COMPLETE_DOSSIER_MODULES,
      ]),
    }),
    sourceRefs: Object.freeze(sourceRefs.map((entry) => Object.freeze({
      sourceId: entry.sourceId,
      supports: frozenList(entry.supports),
    }))),
  });
}

// Os perfis sao explicitos mesmo quando compartilham contextos. A lista de
// contextos e reaproveitada; a decisao de qual perfil recebe qual lista nao e
// inferida de familia, genero ou grupo de cultura.
export const CROP_AGRONOMY_REGISTRY = Object.freeze([
  profile({
    key: 'maize',
    scientific: 'Zea mays',
    catalogId: 'maize',
    discoverCatalog: true,
    agronomyRouting: 'exact',
    purposes: ['grain', 'silage'],
    requiredContexts: [...ANNUAL_FIELD_CONTEXTS, 'harvestDestination'],
    currentModules: [
      CROP_AGRONOMY_MODULES.curatedBasic,
      CROP_AGRONOMY_MODULES.fertilizerExtraction,
      CROP_AGRONOMY_MODULES.pestMonitoring,
    ],
    sourceRefs: [
      sourceRef('embrapaMaizePlanning', [CROP_AGRONOMY_MODULES.fertilizerExtraction]),
      sourceRef('embrapaMaizeNutrition', [CROP_AGRONOMY_MODULES.fertilizerExtraction]),
      sourceRef('embrapaMaizeMip', [CROP_AGRONOMY_MODULES.pestMonitoring]),
      sourceRef('embrapaMaizePests', [CROP_AGRONOMY_MODULES.pestMonitoring]),
      sourceRef('mapaAgrofit', [CROP_AGRONOMY_MODULES.integratedPestManagement]),
    ],
  }),
  profile({
    key: 'cassava', scientific: 'Manihot esculenta', catalogId: 'cassava',
    discoverCatalog: true, agronomyRouting: 'exact', purposes: ['freshRoot', 'starch', 'industrial'],
    requiredContexts: ROOT_CROP_CONTEXTS,
    currentModules: [CROP_AGRONOMY_MODULES.curatedBasic],
    sourceRefs: [
      sourceRef('embrapaCassavaSemiaridSystem', COMPLETE_DOSSIER_MODULES),
      sourceRef('mapaZarc', [CROP_AGRONOMY_MODULES.soilClimate]),
    ],
  }),
  profile({
    key: 'arabicaCoffee', scientific: 'Coffea arabica', catalogId: 'arabicaCoffee',
    discoverCatalog: true, agronomyRouting: 'blocked', purposes: ['beverage'],
    requiredContexts: PERENNIAL_CONTEXTS,
    currentModules: [CROP_AGRONOMY_MODULES.curatedBasic],
    sourceRefs: [
      sourceRef('embrapaCoffeeGoodPracticesMg', COMPLETE_DOSSIER_MODULES),
      sourceRef('mapaZarc', [CROP_AGRONOMY_MODULES.soilClimate]),
    ],
  }),
  profile({
    key: 'soybean', scientific: 'Glycine max', catalogId: 'soybean',
    discoverCatalog: true, agronomyRouting: 'exact', purposes: ['grain', 'seed', 'oil'],
    requiredContexts: [...ANNUAL_FIELD_CONTEXTS, 'harvestPurpose'],
    currentModules: [CROP_AGRONOMY_MODULES.curatedBasic, CROP_AGRONOMY_MODULES.pestMonitoring],
    sourceRefs: [
      sourceRef('embrapaSoyMonitoring', [CROP_AGRONOMY_MODULES.pestMonitoring]),
      sourceRef('embrapaSoyThresholds', [CROP_AGRONOMY_MODULES.pestMonitoring]),
      sourceRef('mapaAgrofit', [CROP_AGRONOMY_MODULES.integratedPestManagement]),
    ],
  }),
  profile({
    key: 'sugarcane', scientific: 'Saccharum officinarum', catalogId: 'sugarcane',
    discoverCatalog: true, agronomyRouting: 'blocked', purposes: ['sugar', 'ethanol', 'forage'],
    requiredContexts: PERENNIAL_CONTEXTS,
    currentModules: [CROP_AGRONOMY_MODULES.curatedBasic],
    sourceRefs: [
      sourceRef('embrapaSugarcaneProduction', COMPLETE_DOSSIER_MODULES),
      sourceRef('mapaZarc', [CROP_AGRONOMY_MODULES.soilClimate]),
    ],
  }),
  profile({
    key: 'breadWheat', scientific: 'Triticum aestivum', catalogId: 'breadWheat',
    discoverCatalog: true, agronomyRouting: 'exact', purposes: ['grain'],
    requiredContexts: ANNUAL_FIELD_CONTEXTS,
    currentModules: [CROP_AGRONOMY_MODULES.curatedBasic],
    sourceRefs: [
      sourceRef('embrapaWheatCultivation', COMPLETE_DOSSIER_MODULES),
      sourceRef('embrapaAgritec', [
        CROP_AGRONOMY_MODULES.soilClimate,
        CROP_AGRONOMY_MODULES.fertilityPlan,
      ]),
      sourceRef('mapaZarc', [CROP_AGRONOMY_MODULES.soilClimate]),
    ],
  }),
  profile({
    key: 'asianRice', scientific: 'Oryza sativa', catalogId: 'asianRice',
    discoverCatalog: true, agronomyRouting: 'exact', purposes: ['grain'],
    requiredContexts: [...ANNUAL_FIELD_CONTEXTS, 'waterRegime'],
    currentModules: [CROP_AGRONOMY_MODULES.curatedBasic],
    sourceRefs: [sourceRef('embrapaRiceNutrition', [CROP_AGRONOMY_MODULES.nutrientDiagnosis])],
  }),
  profile({
    key: 'potato', scientific: 'Solanum tuberosum', catalogId: 'potato',
    discoverCatalog: true, agronomyRouting: 'exact', purposes: ['tuber'],
    requiredContexts: ROOT_CROP_CONTEXTS,
    currentModules: [CROP_AGRONOMY_MODULES.curatedBasic],
    sourceRefs: [
      sourceRef('embrapaPotatoSystem', COMPLETE_DOSSIER_MODULES),
      sourceRef('mapaZarc', [CROP_AGRONOMY_MODULES.soilClimate]),
    ],
  }),
  profile({
    key: 'banana', scientific: 'Musa acuminata', catalogId: 'banana',
    discoverCatalog: true, agronomyRouting: 'exact', purposes: ['fruit'],
    requiredContexts: PERENNIAL_CONTEXTS,
    currentModules: [CROP_AGRONOMY_MODULES.curatedBasic],
    sourceRefs: [
      sourceRef('embrapaBananaProduction', COMPLETE_DOSSIER_MODULES),
      sourceRef('mapaZarc', [CROP_AGRONOMY_MODULES.soilClimate]),
    ],
  }),
  profile({
    key: 'sweetOrange', scientific: 'Citrus x sinensis', exactAliases: ['Citrus sinensis'],
    catalogId: 'sweetOrange', discoverCatalog: true, agronomyRouting: 'exact',
    purposes: ['fruit', 'juice'], requiredContexts: PERENNIAL_CONTEXTS,
    currentModules: [CROP_AGRONOMY_MODULES.curatedBasic],
    sourceRefs: [
      sourceRef('embrapaSeedlessCitrusSystem', COMPLETE_DOSSIER_MODULES),
      sourceRef('mapaZarc', [CROP_AGRONOMY_MODULES.soilClimate]),
    ],
  }),

  profile({
    key: 'sunflower', scientific: 'Helianthus annuus', agronomyRouting: 'exact',
    purposes: ['grain', 'oil'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
  }),
  profile({
    key: 'canola', scientific: 'Brassica napus', agronomyRouting: 'exact',
    purposes: ['grain', 'oil'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
  }),
  profile({
    key: 'brownMustard', scientific: 'Brassica juncea', agronomyRouting: 'exact',
    purposes: ['seed', 'leaf'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
  }),
  profile({
    key: 'brassicaOleracea', scientific: 'Brassica oleracea', agronomyRouting: 'exact',
    purposes: ['vegetable'], requiredContexts: HORTICULTURE_CONTEXTS,
  }),
  profile({
    key: 'quinoa', scientific: 'Chenopodium quinoa', agronomyRouting: 'exact',
    purposes: ['grain'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
  }),
  profile({
    key: 'amaranthCaudatus', scientific: 'Amaranthus caudatus', agronomyRouting: 'exact',
    purposes: ['grain'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
  }),
  profile({
    key: 'amaranthCruentus', scientific: 'Amaranthus cruentus', agronomyRouting: 'exact',
    purposes: ['grain'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
  }),
  profile({
    key: 'amaranthHypochondriacus', scientific: 'Amaranthus hypochondriacus', agronomyRouting: 'exact',
    purposes: ['grain'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
  }),
  profile({
    key: 'lettuce', scientific: 'Lactuca sativa', agronomyRouting: 'exact',
    purposes: ['leaf'], requiredContexts: HORTICULTURE_CONTEXTS,
    sourceRefs: [sourceRef('embrapaLettuceDfSystem', COMPLETE_DOSSIER_MODULES)],
  }),
  profile({
    key: 'onion', scientific: 'Allium cepa', agronomyRouting: 'exact',
    purposes: ['bulb'], requiredContexts: HORTICULTURE_CONTEXTS,
    currentModules: [CROP_AGRONOMY_MODULES.nutrientExcessGuide],
    sourceRefs: [
      sourceRef('embrapaOnionNutrition', [
        CROP_AGRONOMY_MODULES.nutrientExcessGuide,
        CROP_AGRONOMY_MODULES.fertilityPlan,
      ]),
    ],
  }),
  profile({
    key: 'pineapple', scientific: 'Ananas comosus', agronomyRouting: 'exact',
    purposes: ['fruit'], requiredContexts: PERENNIAL_CONTEXTS,
  }),

  profile({
    key: 'commonBean', scientific: 'Phaseolus vulgaris', expansionPriority: true,
    purposes: ['grain'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
    sourceRefs: [
      sourceRef('embrapaCommonBeanCentralBrazil', COMPLETE_DOSSIER_MODULES),
      sourceRef('embrapaAgritec', [
        CROP_AGRONOMY_MODULES.soilClimate,
        CROP_AGRONOMY_MODULES.fertilityPlan,
      ]),
      sourceRef('mapaZarc', [CROP_AGRONOMY_MODULES.soilClimate]),
    ],
  }),
  profile({
    key: 'sorghum', scientific: 'Sorghum bicolor', expansionPriority: true,
    purposes: ['grain', 'silage', 'forage'],
    requiredContexts: [...ANNUAL_FIELD_CONTEXTS, 'harvestDestination'],
  }),
  profile({
    key: 'tomato', scientific: 'Solanum lycopersicum', expansionPriority: true,
    purposes: ['fruit'], requiredContexts: HORTICULTURE_CONTEXTS,
    sourceRefs: [
      sourceRef('embrapaTomatoPests', [CROP_AGRONOMY_MODULES.integratedPestManagement]),
      sourceRef('embrapaTomatoMoth', [CROP_AGRONOMY_MODULES.integratedPestManagement]),
      sourceRef('embrapaTomatoFertilization', [CROP_AGRONOMY_MODULES.fertilityPlan]),
      sourceRef('mapaAgrofit', [CROP_AGRONOMY_MODULES.integratedPestManagement]),
    ],
  }),
  profile({
    key: 'peanut', scientific: 'Arachis hypogaea', expansionPriority: true,
    purposes: ['grain', 'oil'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
  }),
  profile({
    key: 'barley', scientific: 'Hordeum vulgare', expansionPriority: true,
    purposes: ['grain', 'forage'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
  }),
  profile({
    key: 'oat', scientific: 'Avena sativa', expansionPriority: true,
    purposes: ['grain', 'forage'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
  }),
  profile({
    key: 'cotton', scientific: 'Gossypium hirsutum', agronomyRouting: 'blocked',
    expansionPriority: true, purposes: ['fiber', 'seed'], requiredContexts: ANNUAL_FIELD_CONTEXTS,
    sourceRefs: [
      sourceRef('embrapaCottonProductionSystems', COMPLETE_DOSSIER_MODULES),
      sourceRef('embrapaAgritec', [CROP_AGRONOMY_MODULES.soilClimate]),
      sourceRef('mapaZarc', [CROP_AGRONOMY_MODULES.soilClimate]),
    ],
  }),
]);

export function canonicalCropBinomial(value) {
  if (typeof value !== 'string') return '';
  const words = value
    .normalize('NFKC')
    .replace(/[\u00d7\u2715]/g, ' x ')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ');
  if (words.length < 2 || !/^[A-Za-z][A-Za-z.-]*$/.test(words[0])) return '';
  if (words[1].toLowerCase() === 'x') {
    if (!words[2] || !/^[A-Za-z][A-Za-z.-]*$/.test(words[2])) return '';
    return `${words[0]} x ${words[2]}`.toLowerCase();
  }
  if (!/^[A-Za-z][A-Za-z.-]*$/.test(words[1])) return '';
  return `${words[0]} ${words[1]}`.toLowerCase();
}

const PROFILE_INDEX = (() => {
  const index = {};
  for (const entry of CROP_AGRONOMY_REGISTRY) {
    for (const scientific of [entry.scientific, ...entry.exactAliases]) {
      const key = canonicalCropBinomial(scientific);
      if (!key || index[key]) throw new Error(`duplicate or invalid crop binomial: ${scientific}`);
      index[key] = entry;
    }
  }
  return Object.freeze(index);
})();

export function getCropAgronomyProfile(scientific) {
  const key = canonicalCropBinomial(scientific);
  return key ? PROFILE_INDEX[key] || null : null;
}

export function getCropAgronomySource(sourceId) {
  return CROP_AGRONOMY_SOURCES[sourceId] || null;
}

export function selfCheck() {
  const stableKeys = new Set();
  for (const entry of CROP_AGRONOMY_REGISTRY) {
    if (!entry.key || stableKeys.has(entry.key)) throw new Error(`duplicate crop key: ${entry.key}`);
    stableKeys.add(entry.key);
    if (getCropAgronomyProfile(entry.scientific) !== entry) {
      throw new Error(`crop lookup boundary failed: ${entry.scientific}`);
    }
    if (!entry.purposes.length || !entry.requiredContexts.length || !entry.modules.planned.length) {
      throw new Error(`incomplete crop coverage declaration: ${entry.key}`);
    }
    for (const ref of entry.sourceRefs) {
      if (!CROP_AGRONOMY_SOURCES[ref.sourceId] || !ref.supports.length) {
        throw new Error(`invalid crop source reference: ${entry.key}`);
      }
    }
  }
  return true;
}
