const ASPCA = 'ASPCA Animal Poison Control';

// Curadoria fechada por taxon. Prosa do fornecedor e nome popular nunca entram
// neste catalogo: cada linha existe porque a fonte liga explicitamente o nome
// cientifico ao risco de caes/gatos. Ausencia continua sendo "nao confirmado".
const EXACT = Object.freeze({
  'monstera deliciosa': {
    dog: 'toxic', cat: 'toxic', severity: 'warning', parts: 'all', signs: ['oral', 'gastro'],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/cutleaf-philodendron',
  },
  'epipremnum aureum': {
    dog: 'toxic', cat: 'toxic', severity: 'warning', parts: 'all', signs: ['oral', 'gastro'],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/devils-ivy',
  },
  'aloe vera': {
    dog: 'toxic', cat: 'toxic', severity: 'warning', parts: 'foliage', signs: ['gastro', 'lethargy'],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/aloe',
  },
  'cycas revoluta': {
    dog: 'toxic', cat: 'toxic', severity: 'emergency', parts: 'all', signs: ['gastro', 'liver', 'bleeding'],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/sago-palm',
  },
  'nerium oleander': {
    dog: 'toxic', cat: 'toxic', severity: 'emergency', parts: 'all', signs: ['gastro', 'cardiac'],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/oleander',
  },
  'dieffenbachia seguine': {
    dog: 'toxic', cat: 'toxic', severity: 'warning', parts: 'all', signs: ['oral', 'gastro'],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/dieffenbachia',
  },
  'philodendron bipennifolium': {
    dog: 'toxic', cat: 'toxic', severity: 'warning', parts: 'all', signs: ['oral', 'gastro'],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/split-leaf-philodendron',
  },
  'cordyline australis': {
    dog: 'toxic', cat: 'toxic', severity: 'warning', parts: 'all', signs: ['gastro', 'lethargy'],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/palm-lily',
  },
  'chlorophytum comosum': {
    dog: 'safe', cat: 'safe', severity: 'safe', parts: null, signs: [],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants',
  },
  'dypsis lutescens': {
    dog: 'safe', cat: 'safe', severity: 'safe', parts: null, signs: [],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants',
  },
  'chamaedorea elegans': {
    dog: 'safe', cat: 'safe', severity: 'safe', parts: null, signs: [],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants',
  },
  'peperomia obtusifolia': {
    dog: 'safe', cat: 'safe', severity: 'safe', parts: null, signs: [],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants',
  },
});

const GENERA = Object.freeze({
  kalanchoe: {
    dog: 'toxic', cat: 'toxic', severity: 'warning', parts: 'all', signs: ['gastro', 'cardiac'],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/kalanchoe',
  },
  lilium: {
    dog: 'safe', cat: 'toxic', severity: 'emergency', parts: 'all', signs: ['kidney'],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/lily',
  },
  dieffenbachia: {
    dog: 'toxic', cat: 'toxic', severity: 'warning', parts: 'all', signs: ['oral', 'gastro'],
    sourceName: ASPCA,
    sourceUrl: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/dieffenbachia',
  },
});

function cleanScientific(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return clean || null;
}

export function getPetSafetyRecord(scientific) {
  const key = cleanScientific(scientific);
  if (!key) return null;
  if (EXACT[key]) return { ...EXACT[key], scope: 'species', scientific: key };
  const genus = key.split(' ')[0];
  return GENERA[genus] ? { ...GENERA[genus], scope: 'genus', scientific: genus } : null;
}

export const PET_SAFETY_CATALOG_SIZE = Object.keys(EXACT).length + Object.keys(GENERA).length;
