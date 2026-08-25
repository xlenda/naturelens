// Ilustracoes gerais ajudam a pessoa a saber ONDE olhar, mas nunca provam a
// especie da foto. O manifesto deixa essa fronteira auditavel e impede que um
// ativo sem autoria/escopo entre silenciosamente na ficha.
const SHARED = Object.freeze({
  scope: 'general',
  creator: 'NatureLens / OpenAI',
  source: 'OpenAI image generation',
  license: 'Generated project asset',
  reviewedAt: '2026-08-21',
});

export const DIDACTIC_VISUALS = Object.freeze({
  plant: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/plant.png'),
    parts: Object.freeze([
      ['leaf-outline', 'learning.parts.leaf'],
      ['git-branch-outline', 'learning.parts.stemNode'],
      ['flower-outline', 'learning.parts.flower'],
      ['analytics-outline', 'learning.parts.roots'],
    ]),
  }),
  tree: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/tree.png'),
    parts: Object.freeze([
      ['cloud-outline', 'learning.parts.canopy'],
      ['git-branch-outline', 'learning.parts.branches'],
      ['trail-sign-outline', 'learning.parts.trunkBark'],
      ['analytics-outline', 'learning.parts.roots'],
    ]),
  }),
  crop: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/crop.png'),
    parts: Object.freeze([
      ['leaf-outline', 'learning.parts.youngOldLeaves'],
      ['search-outline', 'learning.parts.affectedArea'],
      ['git-branch-outline', 'learning.parts.stem'],
      ['analytics-outline', 'learning.parts.roots'],
    ]),
  }),
  insect: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/invertebrate.png'),
    parts: Object.freeze([
      ['radio-outline', 'learning.parts.antennae'],
      ['ellipse-outline', 'learning.parts.head'],
      ['layers-outline', 'learning.parts.bodySections'],
      ['bug-outline', 'learning.parts.wingsLegs'],
    ]),
  }),
  invertebrate: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/invertebrate.png'),
    parts: Object.freeze([
      ['layers-outline', 'learning.parts.bodySections'],
      ['color-palette-outline', 'learning.parts.bodyMarks'],
    ]),
  }),
  arachnid: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/arachnid.png'),
    parts: Object.freeze([
      ['ellipse-outline', 'learning.parts.cephalothorax'],
      ['layers-outline', 'learning.parts.abdomen'],
      ['eye-outline', 'learning.parts.eyes'],
      ['git-branch-outline', 'learning.parts.eightLegs'],
    ]),
  }),
  gastropod: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/gastropod.png'),
    parts: Object.freeze([
      ['ellipse-outline', 'learning.parts.head'],
      ['radio-outline', 'learning.parts.tentacles'],
      ['disc-outline', 'learning.parts.shell'],
      ['trail-sign-outline', 'learning.parts.muscularFoot'],
    ]),
  }),
  annelid: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/annelid.png'),
    parts: Object.freeze([
      ['arrow-up-circle-outline', 'learning.parts.anterior'],
      ['reorder-three-outline', 'learning.parts.segments'],
      ['ellipse-outline', 'learning.parts.clitellum'],
      ['arrow-down-circle-outline', 'learning.parts.posterior'],
    ]),
  }),
  mushroom: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/fungus.png'),
    parts: Object.freeze([
      ['umbrella-outline', 'learning.parts.cap'],
      ['reorder-three-outline', 'learning.parts.underside'],
      ['remove-outline', 'learning.parts.stem'],
      ['earth-outline', 'learning.parts.baseSubstrate'],
    ]),
  }),
  bird: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/bird.png'),
    parts: Object.freeze([
      ['caret-forward-outline', 'learning.parts.beak'],
      ['leaf-outline', 'learning.parts.wing'],
      ['git-branch-outline', 'learning.parts.tail'],
      ['footsteps-outline', 'learning.parts.feet'],
    ]),
  }),
  fish: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/fish.png'),
    parts: Object.freeze([
      ['eye-outline', 'learning.parts.headProfile'],
      ['color-palette-outline', 'learning.parts.bodyMarks'],
      ['fish-outline', 'learning.parts.fins'],
      ['git-branch-outline', 'learning.parts.tail'],
    ]),
  }),
  sound: Object.freeze({
    ...SHARED,
    image: require('../assets/didactic/sound.png'),
    parts: Object.freeze([
      ['mic-outline', 'learning.parts.recording'],
      ['pulse-outline', 'learning.parts.rhythm'],
      ['swap-vertical-outline', 'learning.parts.pitch'],
      ['repeat-outline', 'learning.parts.repetition'],
    ]),
  }),
});

const INVERTEBRATE_CLASS_VISUAL = Object.freeze({
  insecta: 'insect',
  arachnida: 'arachnid',
  gastropoda: 'gastropod',
  clitellata: 'annelid',
});

const normaliseTaxon = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export function didacticVisualFor(category, entity) {
  if (category !== 'insect') return DIDACTIC_VISUALS[category] || null;

  const taxonClass = normaliseTaxon(entity?.taxonClass);
  const taxonPhylum = normaliseTaxon(entity?.taxonPhylum);
  const classVisual = INVERTEBRATE_CLASS_VISUAL[taxonClass];
  if (classVisual) return DIDACTIC_VISUALS[classVisual];
  if (taxonPhylum === 'annelida') return DIDACTIC_VISUALS.annelid;

  // Sem classe documentada, a arte e a legenda ficam amplas. Inferir Insecta
  // pela aba seria repetir o erro que mostrou asas para aranhas e caracois.
  return DIDACTIC_VISUALS.invertebrate;
}
