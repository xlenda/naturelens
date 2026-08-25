import { getSpeciesDetails } from './speciesDetails';
import { curatedScientific } from './curatedDetails';

// Curated field-guide content for identified birds.
//
// Nyckel's classifier returns only { labelName, confidence } - no description,
// no habitat, no photo - which left BirdDetailScreen as the emptiest screen in
// the app. This fills that gap for the species people actually photograph,
// reusing the same {code}-species.json file the Discover collections already
// load (so a bird curated for Discover is automatically curated here too).
//
// The join key is the ENGLISH label Nyckel returns, because that is the only
// identifier we share with the vendor. BIRD_LABEL_TO_ID maps those labels onto
// our stable camelCase ids. A species outside the map simply has no curated
// entry and the screen keeps its honest placeholder - it never invents facts
// about a bird we did not write about.
const BIRD_LABEL_TO_ID = {
  'Barn Swallow': 'barnSwallow',
  'House Sparrow': 'houseSparrow',
  'Common Kingfisher': 'commonKingfisher',
  'Peregrine Falcon': 'peregrineFalcon',
  'Great Blue Heron': 'greatBlueHeron',
  'Rock Pigeon': 'rockPigeon',
  'Rock Dove': 'rockPigeon',
  'European Robin': 'europeanRobin',
  Mallard: 'mallard',
  'Mallard Duck': 'mallard',
  'Scarlet Macaw': 'scarletMacaw',
  'Emperor Penguin': 'emperorPenguin',
};

// Nyckel's labels are not perfectly consistent in case or spacing, so match on
// a normalised form rather than requiring an exact string.
const NORMALISED = new Map(
  Object.entries(BIRD_LABEL_TO_ID).map(([label, id]) => [label.toLowerCase().replace(/\s+/g, ' ').trim(), id])
);

// Apenas especies para as quais o contexto do dossie continua seguro sem
// perguntar habitat. Kingfisher, pinguim, falcao e arara ficam fora: familia
// ou fama nao prova que a foto foi feita em jardim ou mata.
const BIRD_ID_TO_GROUP = Object.freeze({
  barnSwallow: 'gardenBird',
  houseSparrow: 'gardenBird',
  greatBlueHeron: 'forestBird',
  rockPigeon: 'gardenBird',
  europeanRobin: 'gardenBird',
  mallard: 'forestBird',
});

export function birdIdFromLabel(label) {
  if (typeof label !== 'string') return null;
  return NORMALISED.get(label.toLowerCase().replace(/\s+/g, ' ').trim()) || null;
}

export function scientificForBirdLabel(label) {
  const id = birdIdFromLabel(label);
  return id ? curatedScientific('bird', id) : null;
}

export function guideGroupForBirdLabel(label) {
  const id = birdIdFromLabel(label);
  return id ? BIRD_ID_TO_GROUP[id] || null : null;
}

export async function getCuratedBird(languageCode, label) {
  const id = birdIdFromLabel(label);
  if (!id) return null;
  try {
    const data = await getSpeciesDetails(languageCode);
    const detail = data?.birdDetails?.[id];
    return detail ? { ...detail, id, scientific: curatedScientific('bird', id) } : null;
  } catch (e) {
    return null;
  }
}
