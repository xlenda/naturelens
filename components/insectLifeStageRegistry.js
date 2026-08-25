// Curadoria pequena e estritamente binomial. Estes numeros nao sao um
// fallback para "lagartas": pertencem somente a Anticarsia gemmatalis e
// viajam com a publicacao oficial que os sustenta.
const EMBRAPA_ANTICARSIA = Object.freeze({
  id: 'embrapa-soy-caterpillar',
  label: 'Embrapa',
  url: 'https://www.embrapa.br/web/agencia-de-informacao-tecnologica/cultivos/soja/producao/manejo-integrado-de-pragas/pragas/pragas-que-atacam-folhas/lagarta-da-soja',
  license: 'citation-only',
});

const NC_STATE_INSECT_LIFE_CYCLES = Object.freeze({
  id: 'nc-state-insect-metamorphosis',
  label: 'NC State Extension',
  url: 'https://content.ces.ncsu.edu/extension-gardener-handbook/4-insects',
  license: 'citation-only',
});

// A fonte nomeia estes grupos como exemplos de metamorfose completa ou
// gradual. A sequencia e do nivel da ORDEM, nunca uma duracao da especie.
const COMPLETE_ORDERS = new Set([
  'coleoptera',
  'diptera',
  'hymenoptera',
  'lepidoptera',
  'siphonaptera',
]);
const GRADUAL_ORDERS = new Set([
  'blattodea',
  'dermaptera',
  'hemiptera',
  'orthoptera',
]);

const RECORDS = Object.freeze({
  'Anticarsia gemmatalis': Object.freeze({
    scientific: 'Anticarsia gemmatalis',
    larvalInstars: 6,
    groups: Object.freeze([
      Object.freeze({
        from: 1,
        to: 3,
        maxLengthMm: 10,
        leafConsumptionPercent: 5,
      }),
      Object.freeze({
        from: 4,
        to: 6,
        leafConsumptionPercent: 95,
        leafAreaCm2: Object.freeze({ min: 100, max: 120 }),
      }),
    ]),
    source: EMBRAPA_ANTICARSIA,
  }),
});

function cleanScientific(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().normalize('NFC');
  return /^\p{Lu}[\p{L}-]{1,63} \p{Ll}[\p{L}-]{1,63}$/u.test(clean) ? clean : null;
}

function getInsectLifeStageProfile(scientific) {
  const exact = cleanScientific(scientific);
  return exact ? RECORDS[exact] || null : null;
}

function cleanRank(value) {
  return typeof value === 'string'
    ? value.trim().normalize('NFC').toLocaleLowerCase('en-US')
    : '';
}

function getInsectOrderStageProfile({ order, taxonClass } = {}) {
  if (cleanRank(taxonClass) !== 'insecta') return null;
  const orderKey = cleanRank(order);
  const stages = COMPLETE_ORDERS.has(orderKey)
    ? ['egg', 'larva', 'pupa', 'adult']
    : GRADUAL_ORDERS.has(orderKey)
      ? ['egg', 'nymph', 'adult']
      : null;
  if (!stages) return null;
  return {
    order: String(order).trim(),
    metamorphosis: COMPLETE_ORDERS.has(orderKey) ? 'complete' : 'gradual',
    stages,
    source: NC_STATE_INSECT_LIFE_CYCLES,
  };
}

module.exports = {
  EMBRAPA_ANTICARSIA,
  NC_STATE_INSECT_LIFE_CYCLES,
  RECORDS,
  getInsectLifeStageProfile,
  getInsectOrderStageProfile,
};
