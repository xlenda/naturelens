import { getSpeciesDetail } from './speciesDetails';

// Ligacao entre o identificador cientifico devolvido pelos fornecedores e o
// catalogo editorial ja traduzido em *-species.json. O binomio e a unica chave
// que permanece igual nos 17 idiomas; nome popular nao e uma chave segura.
//
// A tabela e fechada de proposito: um nome desconhecido devolve null. Aproximar
// por genero ou por nome parecido poderia anexar habitat e curiosidade da
// especie errada, que e pior do que esconder o bloco.
const INDEX = {
  fish: {
    'amphiprion ocellaris': 'clownfish',
    'oncorhynchus mykiss': 'rainbowTrout',
    'salmo salar': 'atlanticSalmon',
    'esox lucius': 'northernPike',
    'cyprinus carpio': 'commonCarp',
    'paracanthurus hepatus': 'blueTang',
    'micropterus salmoides': 'largemouthBass',
    'thunnus albacares': 'yellowfinTuna',
    'danio rerio': 'zebrafish',
    'pterois volitans': 'redLionfish',
  },
  bird: {
    'hirundo rustica': 'barnSwallow',
    'passer domesticus': 'houseSparrow',
    'alcedo atthis': 'commonKingfisher',
    'falco peregrinus': 'peregrineFalcon',
    'ardea herodias': 'greatBlueHeron',
    'columba livia': 'rockPigeon',
    'erithacus rubecula': 'europeanRobin',
    'anas platyrhynchos': 'mallard',
    'ara macao': 'scarletMacaw',
    'aptenodytes forsteri': 'emperorPenguin',
  },
  crop: {
    'zea mays': 'maize',
    'manihot esculenta': 'cassava',
    'coffea arabica': 'arabicaCoffee',
    'glycine max': 'soybean',
    'saccharum officinarum': 'sugarcane',
    'triticum aestivum': 'breadWheat',
    'oryza sativa': 'asianRice',
    'solanum tuberosum': 'potato',
    'musa acuminata': 'banana',
    'citrus x sinensis': 'sweetOrange',
    // Alguns provedores omitem o sinal de hibrido do mesmo binomio aceito.
    'citrus sinensis': 'sweetOrange',
  },
  insect: {
    'coccinella septempunctata': 'sevenSpotLadybird',
    'forficula auricularia': 'commonEarwig',
    'armadillidium vulgare': 'commonPillWoodlouse',
    'musca domestica': 'houseFly',
    'cornu aspersum': 'gardenSnail',
    'apis mellifera': 'westernHoneyBee',
    'vanessa cardui': 'paintedLady',
    'pholcus phalangioides': 'cellarSpider',
    'linepithema humile': 'argentineAnt',
    'lumbricus terrestris': 'commonEarthworm',
  },
  mushroom: {
    'amanita muscaria': 'flyAgaric',
    'amanita phalloides': 'deathCap',
    'agaricus bisporus': 'buttonMushroom',
    'saccharomyces cerevisiae': 'brewersYeast',
    'ophiocordyceps unilateralis': 'zombieAntFungus',
    'armillaria ostoyae': 'humongousFungus',
    'panellus stipticus': 'bitterOyster',
    'penicillium rubens': 'penicilliumMould',
    'batrachochytrium dendrobatidis': 'chytridFungus',
    'tuber magnatum': 'whiteTruffle',
  },
  sound: {
    'strix aluco': 'tawnyOwl',
    'cuculus canorus': 'commonCuckoo',
    'luscinia megarhynchos': 'commonNightingale',
    'hyla arborea': 'europeanTreeFrog',
    'lithobates catesbeianus': 'americanBullfrog',
    'cicada orni': 'cicadaOrni',
    'acheta domesticus': 'houseCricket',
    'tettigonia viridissima': 'greatGreenBushCricket',
    'alouatta caraya': 'blackHowlerMonkey',
    'vulpes vulpes': 'redFox',
  },
};

const CANONICAL = {
  fish: {
    clownfish: 'Amphiprion ocellaris',
    rainbowTrout: 'Oncorhynchus mykiss',
    atlanticSalmon: 'Salmo salar',
    northernPike: 'Esox lucius',
    commonCarp: 'Cyprinus carpio',
    blueTang: 'Paracanthurus hepatus',
    largemouthBass: 'Micropterus salmoides',
    yellowfinTuna: 'Thunnus albacares',
    zebrafish: 'Danio rerio',
    redLionfish: 'Pterois volitans',
  },
  bird: {
    barnSwallow: 'Hirundo rustica',
    houseSparrow: 'Passer domesticus',
    commonKingfisher: 'Alcedo atthis',
    peregrineFalcon: 'Falco peregrinus',
    greatBlueHeron: 'Ardea herodias',
    rockPigeon: 'Columba livia',
    europeanRobin: 'Erithacus rubecula',
    mallard: 'Anas platyrhynchos',
    scarletMacaw: 'Ara macao',
    emperorPenguin: 'Aptenodytes forsteri',
  },
  crop: {
    maize: 'Zea mays',
    cassava: 'Manihot esculenta',
    arabicaCoffee: 'Coffea arabica',
    soybean: 'Glycine max',
    sugarcane: 'Saccharum officinarum',
    breadWheat: 'Triticum aestivum',
    asianRice: 'Oryza sativa',
    potato: 'Solanum tuberosum',
    banana: 'Musa acuminata',
    sweetOrange: 'Citrus x sinensis',
  },
  insect: {
    sevenSpotLadybird: 'Coccinella septempunctata',
    commonEarwig: 'Forficula auricularia',
    commonPillWoodlouse: 'Armadillidium vulgare',
    houseFly: 'Musca domestica',
    gardenSnail: 'Cornu aspersum',
    westernHoneyBee: 'Apis mellifera',
    paintedLady: 'Vanessa cardui',
    cellarSpider: 'Pholcus phalangioides',
    argentineAnt: 'Linepithema humile',
    commonEarthworm: 'Lumbricus terrestris',
  },
  mushroom: {
    flyAgaric: 'Amanita muscaria',
    deathCap: 'Amanita phalloides',
    buttonMushroom: 'Agaricus bisporus',
    brewersYeast: 'Saccharomyces cerevisiae',
    zombieAntFungus: 'Ophiocordyceps unilateralis',
    humongousFungus: 'Armillaria ostoyae',
    bitterOyster: 'Panellus stipticus',
    penicilliumMould: 'Penicillium rubens',
    chytridFungus: 'Batrachochytrium dendrobatidis',
    whiteTruffle: 'Tuber magnatum',
  },
  sound: {
    tawnyOwl: 'Strix aluco',
    commonCuckoo: 'Cuculus canorus',
    commonNightingale: 'Luscinia megarhynchos',
    europeanTreeFrog: 'Hyla arborea',
    americanBullfrog: 'Lithobates catesbeianus',
    cicadaOrni: 'Cicada orni',
    houseCricket: 'Acheta domesticus',
    greatGreenBushCricket: 'Tettigonia viridissima',
    blackHowlerMonkey: 'Alouatta caraya',
    redFox: 'Vulpes vulpes',
  },
};

// A chave crua escolhe a severidade; o texto localizado vem do verbete exato.
// A lista e fechada para uma chave nova ou digitada errado nunca ganhar uma
// aparencia de seguranca por acidente.
const SAFETY_LEVELS = Object.freeze({
  venomous_spines: 'danger',
  sharp_tail_spine: 'warning',
});

export const canonicalBinomial = (value) => {
  if (typeof value !== 'string') return '';
  const words = value
    .trim()
    .toLowerCase()
    .replace(/[×✕]/g, 'x')
    .replace(/\s+/g, ' ')
    .split(' ');
  if (words.length < 2) return '';
  // Autoridade e cultivar nao mudam a especie. Hibridos conservam o `x`, que
  // faz parte da chave e impede uma aproximacao por genero.
  return words[1] === 'x' && words[2]
    ? words.slice(0, 3).join(' ')
    : words.slice(0, 2).join(' ');
};

export function curatedDetailId(category, scientific) {
  return INDEX[category]?.[canonicalBinomial(scientific)] || null;
}

export function curatedScientific(category, id) {
  return CANONICAL[category]?.[id] || null;
}

export function curatedDisplayName(rows, id) {
  if (!id || !Array.isArray(rows)) return null;
  const match = rows.find((row) => row?.id === id);
  return typeof match?.name === 'string' && match.name.trim() ? match.name.trim() : null;
}

export async function getCuratedDetail(language, category, scientific) {
  const id = curatedDetailId(category, scientific);
  if (!id) return null;
  const detail = await getSpeciesDetail(language, id);
  if (!detail) return null;
  return { ...detail, id, scientific: curatedScientific(category, id) || scientific };
}

export async function getCuratedSafety(language, category, scientific) {
  const detail = await getCuratedDetail(language, category, scientific);
  const riskKey = detail?.riskKey;
  const riskLevel = SAFETY_LEVELS[riskKey];
  const text = typeof detail?.safety === 'string' ? detail.safety.trim() : '';
  if (!detail?.scientific || !riskLevel || !text) return null;
  return { scientific: detail.scientific, riskKey, riskLevel, text };
}
