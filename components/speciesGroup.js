// Maps an identified entity onto one of the 19 curated group keys used by
// {lang}-groups.json (see components/groupContent.js). Pure module, no imports:
// it is just lookup tables plus a resolution order, so it can be unit-checked
// without a device, a network or a mock.
//
// WHY FAMILY AND NOT SPECIES: the per-group manual answers "a cactus needs less
// water than a fruit tree" - a statement about the TYPE, not about one species.
// api/identify.js forwards `family` and `ord` (taxonomy.family / taxonomy.order)
// precisely to feed this table. Those two fields are never shown raw.
//
// WHICH CATEGORIES ACTUALLY SEND THEM is the api's business, not this file's,
// and it changes: plant, tree, insect and mushroom have sent them since day
// one, crop and fish read them from their own vendor block and may still send
// null, and bird/sound send nothing at all today. This module therefore never
// assumes the fields are there. When they arrive, the table answers; when they
// do not, the answer is `null` and the reader gets the universal manual with no
// visible hole. What must never happen is the middle ground - guessing a group
// from the category alone and showing a confident manual for the wrong type.
//
// WHY THERE IS ALSO A GENUS TABLE: the dossiers are explicit that family alone
// gets several very common houseplants WRONG - "Classificar pela familia da o
// resultado errado aqui" (suculentas-e-cactos.md, on Zamioculcas). Those are
// listed one by one in TAXON below, each with the dossier that justifies it.
// It is deliberately a short list of documented exceptions, not a species
// database.
//
// RETURNS null WHENEVER THE ANSWER IS A COIN FLIP. A wrong group is worse than
// no group: the reader would get confident, specific, irrelevant advice next to
// the correct universal manual. `null` simply hides the extra card.

const norm = (s) =>
  typeof s === 'string'
    ? s.trim().toLowerCase().replace(/[×✕]/g, ' x ').replace(/\s+/g, ' ')
    : '';

const binomialOf = (scientific) => {
  const parts = scientific.split(/\s+/);
  if (parts[1] === 'x' && parts[2]) return `${parts[0]} ${parts[2]}`;
  return parts.slice(0, 2).join(' ');
};

/**
 * Genus and binomial overrides, checked BEFORE family.
 * Key: lowercase genus, or lowercase "genus species" when the genus itself is
 * split across groups (Ficus is both a houseplant and a fruit tree).
 */
const TAXON = {
  // --- Cactaceae that is NOT a desert cactus ---------------------------------
  // orquideas-e-epifitas.md lists the forest cacti as epiphytes: they "grow as
  // epiphytes among tree branches in shady rain forests" and their water
  // management is the OPPOSITE of the desert ones. Same family, inverted care.
  schlumbergera: 'orchid',
  rhipsalidopsis: 'orchid',
  hatiora: 'orchid',
  epiphyllum: 'orchid',
  rhipsalis: 'orchid',
  disocactus: 'orchid',
  selenicereus: 'orchid',

  // --- Araceae / Asparagaceae that is watered like a succulent ---------------
  // Clemson: ZZ is watered "1 to 2 times per month, only after the substrate
  // has dried completely". Araceae by taxonomy, cactus by technique.
  zamioculcas: 'succulent',
  // folhagens-tropicais-de-interior.md: Sansevieria (now inside Dracaena) is
  // "suculenta funcional e propensa a apodrecer por excesso de rega".
  sansevieria: 'succulent',
  // Asparagaceae subfam. Agavoideae -> succulent (suculentas dossier);
  // Nolinoideae (Dracaena, Aspidistra) falls through to the family table.
  agave: 'succulent',
  yucca: 'succulent',
  furcraea: 'succulent',
  // Asparagus is the vegetable inside the same family (frutiferas dossier).
  asparagus: 'fruitVeg',

  // --- Rosaceae is three groups at once (frutiferas + floriferas + lenhosas) --
  rosa: 'flowering', // "classificar como florifera, com nota de lenhosa"
  spiraea: 'woody',
  photinia: 'woody',
  pyracantha: 'woody',

  // --- Solanaceae / Asteraceae / Apiaceae / Amaryllidaceae ornamentals -------
  // These genera appear ONLY in floriferas-e-ornamentais.md, never in the
  // edible dossiers, so they must not inherit the vegetable mapping.
  petunia: 'flowering',
  calibrachoa: 'flowering',
  nicotiana: 'flowering',
  narcissus: 'flowering',
  hippeastrum: 'flowering',
  monarda: 'flowering',
  nepeta: 'flowering',
  // ...and the reverse: edible genera inside families mapped to herbs/flowers.
  lactuca: 'fruitVeg',
  cichorium: 'fruitVeg',
  cynara: 'fruitVeg',
  daucus: 'fruitVeg',
  apium: 'fruitVeg',
  allium: 'fruitVeg',
  artemisia: 'herb',
  tanacetum: 'herb',

  // --- Ficus is a houseplant AND a fruit tree, so this one needs the species --
  'ficus carica': 'fruitVeg',
  vaccinium: 'fruitVeg', // Ericaceae, but grouped by the organ harvested
  artocarpus: 'fruitVeg',
  // So taxons com cultivo alimentar comprovado. Familia nao abre este guia:
  // Rosaceae tambem tem cerejeira ornamental e rosa, e Arecaceae tem palmeiras
  // de paisagismo. O binomio exato leva a frutifera ao manejo de pomar sem
  // transformar parentes ornamentais em lavoura. Desconhecida fica sem dose.
  'malus domestica': 'fruitVeg',
  'pyrus communis': 'fruitVeg',
  'prunus persica': 'fruitVeg',
  'prunus domestica': 'fruitVeg',
  'prunus armeniaca': 'fruitVeg',
  'prunus avium': 'fruitVeg',
  'prunus cerasus': 'fruitVeg',
  'citrus sinensis': 'fruitVeg',
  'citrus limon': 'fruitVeg',
  'citrus reticulata': 'fruitVeg',
  'citrus aurantiifolia': 'fruitVeg',
  'citrus latifolia': 'fruitVeg',
  'citrus paradisi': 'fruitVeg',
  'mangifera indica': 'fruitVeg',
  'persea americana': 'fruitVeg',
  'psidium guajava': 'fruitVeg',
  'cocos nucifera': 'fruitVeg',
  'carica papaya': 'fruitVeg',
  'musa acuminata': 'fruitVeg',
  'musa paradisiaca': 'fruitVeg',
  'vitis vinifera': 'fruitVeg',
  'punica granatum': 'fruitVeg',
  'olea europaea': 'fruitVeg',
  'annona muricata': 'fruitVeg',
  'annona squamosa': 'fruitVeg',
  'anacardium occidentale': 'fruitVeg',
  'eugenia uniflora': 'fruitVeg',
  'passiflora edulis': 'fruitVeg',
  'fragaria ananassa': 'fruitVeg',
  'theobroma cacao': 'fruitVeg',
  'coffea arabica': 'fruitVeg',
  'coffea canephora': 'fruitVeg',
  // Same "organ harvested" rule (frutiferas-e-hortalicas.md: "o discriminante e
  // o orgao colhido, nao o parentesco"). Ananas is the one Bromeliaceae the
  // dossiers file as food - lavouras-hortalicas-e-frutiferas.md lists
  // *Ananas comosus* - so it must not inherit the epiphyte watering of its
  // family, which is built around bark, no soil and a leaf reservoir.
  ananas: 'fruitVeg',
  // Poaceae as a whole is not mappable (see the note above FAMILY), but sweet
  // corn is named in frutiferas-e-hortalicas.md as a garden vegetable.
  zea: 'fruitVeg',

  // --- Insects whose family sits in the other camp ---------------------------
  // insetos-praga-comuns.md: Epilachna is "a unica linhagem de joaninha que
  // entra neste grupo" - a leaf-eating Coccinellidae.
  epilachna: 'pestInsect',
  // Pieridae is in BOTH insect dossiers: the adults are nectar visitors
  // (insetos-polinizadores.md) and the larvae are the brassica caterpillars of
  // insetos-praga-comuns.md ("Plutellidae / Noctuidae / Pieridae em
  // brassicas", Clemson Cole Crop Insect Pests). The family therefore stays
  // pollinator - what is photographed is the adult on a flower - and only the
  // cabbage white is pulled out. BINOMIAL and not genus on purpose: *Pieris*
  // is also the Ericaceae shrub of arvores-e-arbustos-lenhosos.md, and a genus
  // key would turn an andromeda bush into a pest insect.
  'pieris rapae': 'pestInsect',
  // Reduviidae are beneficial assassin bugs EXCEPT subfamily Triatominae, the
  // Chagas vectors, which carry the app's most serious safety protocol.
  triatoma: 'pestInsect',
  rhodnius: 'pestInsect',
  panstrongylus: 'pestInsect',
  // O dossie cobre especificamente as formigas cortadeiras (Attini), nao a
  // familia Formicidae inteira. Estes dois generos sao os taxons nomeados pela
  // fonte da Embrapa; outras formigas falham fechado.
  atta: 'pestInsect',
  acromyrmex: 'pestInsect',
  // Embrapa documenta este binomio como lagarta desfolhadora da soja. O
  // override e exato porque Erebidae inteira nao define papel agronomico.
  'anticarsia gemmatalis': 'pestInsect',
  // Saturniidae mistura mariposas muito diferentes. O protocolo medico atual
  // tem evidencia exata para Lonomia obliqua; a familia ampla fica sem guia.
  'lonomia obliqua': 'pestInsect',

  // --- Fungi: the dossiers name GENERA, not families (see FAMILY note) -------
  // cogumelos-decompositores.md, taxonomy note: "as fontes de extensao
  // consultadas nomeiam generos e especies, nao familias". So the saprotrophs
  // are matched by the genera those sources actually named.
  marasmius: 'decomposerFungus',
  chlorophyllum: 'decomposerFungus',
  agaricus: 'decomposerFungus',
  coprinus: 'decomposerFungus',
  coprinopsis: 'decomposerFungus',
  panaeolus: 'decomposerFungus',
  conocybe: 'decomposerFungus',
  clitocybe: 'decomposerFungus',
  armillaria: 'decomposerFungus',
  climacodon: 'decomposerFungus',
  fomes: 'decomposerFungus',
  ganoderma: 'decomposerFungus',
  daedalea: 'decomposerFungus',
  laetiporus: 'decomposerFungus',
  cerrena: 'decomposerFungus',
  sphaerobolus: 'decomposerFungus',
  crucibulum: 'decomposerFungus',
  cyathus: 'decomposerFungus',
  // Cultivated saprotrophs, named in the same dossier as the reason this is the
  // only fungal group that CAN be farmed.
  lentinula: 'decomposerFungus',
  pleurotus: 'decomposerFungus',
  flammulina: 'decomposerFungus',
  // Ectomycorrhizal genera confirmed by the primary paper read in
  // cogumelos-micorrizicos.md ("Amanita, Cortinarius, Inocybe, Lactarius,
  // Russula e Tricholoma, the most abundant taxa above-ground").
  amanita: 'mycorrhizalFungus',
  cortinarius: 'mycorrhizalFungus',
  inocybe: 'mycorrhizalFungus',
  lactarius: 'mycorrhizalFungus',
  russula: 'mycorrhizalFungus',
  tricholoma: 'mycorrhizalFungus',
  boletus: 'mycorrhizalFungus',
};

/**
 * Culturas de lavoura cobertas explicitamente pelos dossies.
 *
 * O valor null e deliberado: cana, algodao e cafe sao culturas importantes,
 * mas os dossies atuais nao cobrem seu sistema de producao. A familia nunca
 * completa a classificacao: ela daria protocolo de graos para cana e de
 * hortalicas para algodao. As entradas positivas sao uma allowlist exata.
 */
const CROP_TAXON = {
  'zea mays': 'grainCrop',
  'glycine max': 'grainCrop',
  'triticum aestivum': 'grainCrop',
  'oryza sativa': 'grainCrop',
  'helianthus annuus': 'grainCrop',
  'brassica napus': 'grainCrop',
  'brassica juncea': 'grainCrop',
  'brassica oleracea': 'vegCrop',
  'chenopodium quinoa': 'grainCrop',
  'amaranthus caudatus': 'grainCrop',
  'amaranthus cruentus': 'grainCrop',
  'amaranthus hypochondriacus': 'grainCrop',
  'manihot esculenta': 'vegCrop',
  'solanum tuberosum': 'vegCrop',
  'lactuca sativa': 'vegCrop',
  'allium cepa': 'vegCrop',
  'ananas comosus': 'vegCrop',
  'musa acuminata': 'vegCrop',
  'citrus sinensis': 'vegCrop',
  saccharum: null,
  gossypium: null,
  coffea: null,
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Families whose group only becomes single-valued once you know WHAT was
 * photographed. Consulted right before FAMILY, and only for the category
 * listed - any other category falls through to `null`, which is the honest
 * answer for a family the dossiers split across three groups.
 */
const FAMILY_BY_CATEGORY = {
  // The only palm the dossiers describe is the INDOOR one:
  // folhagens-tropicais-de-interior.md and samambaias-e-plantas-de-sombra.md
  // both name *Chamaedorea elegans*, in a pot and in a terrarium. A grown
  // coconut is not that plant, so on the tree category Arecaceae stays
  // unmapped instead of collecting houseplant watering advice.
  arecaceae: { plant: 'tropicalFoliage' },
  // arvores-e-arbustos-lenhosos.md defines its group by "madeira persistente +
  // gemas aereas, nao o porte" - a Fabaceae photographed as a TREE has both by
  // definition. In a bed the same family is bean, pea or clover, three
  // different destinations, so there it stays unmapped.
  fabaceae: { tree: 'woody' },
};

/**
 * Family -> group, for every other category.
 *
 * TWO HUGE FAMILIES ARE MISSING ON PURPOSE, and adding them would be the bug,
 * not the fix:
 *  - Poaceae. Outside a field it is lawn, bamboo and ornamental grass, and the
 *    corpus has no dossier for any of those. Its only garden entry is sweet
 *    corn (frutiferas-e-hortalicas.md), handled by genus in TAXON; field crops
 *    are handled only by the exact CROP_TAXON allowlist.
 *  - Euphorbiaceae. The corpus scatters it across three groups: succulent
 *    *Euphorbia* (suculentas-e-cactos.md), *Manihot* as a crop
 *    (lavouras-hortalicas-e-frutiferas.md, reached through CROP_TAXON) and
 *    *Ricinus* on the high-danger list of seguranca-plantas-toxicas.md. And
 *    the split is not even at genus level: the same *Euphorbia* covers the
 *    spiny succulents that "enganam muito" and the poinsettia, which is
 *    watered like any flowering pot plant. Nothing in the identified entity
 *    tells those apart, so mapping the family would hand a soak-and-dry desert
 *    regime to the exact plants the dossier warns are only cactus-shaped.
 */
const FAMILY = {
  // ---- Suculentas e cactos -------------------------------------------------
  cactaceae: 'succulent', // desert cacti; the forest ones are caught by TAXON
  crassulaceae: 'succulent',
  aizoaceae: 'succulent',
  anacampserotaceae: 'succulent',
  asphodelaceae: 'succulent', // Aloe, Haworthia, Gasteria (POWO placement)
  didiereaceae: 'succulent',
  portulacaceae: 'succulent',

  // ---- Folhagens tropicais de interior -------------------------------------
  araceae: 'tropicalFoliage',
  asparagaceae: 'tropicalFoliage', // Dracaena/Sansevieria/Aspidistra dominate
  marantaceae: 'tropicalFoliage',
  moraceae: 'tropicalFoliage', // ornamental Ficus; F. carica handled in TAXON
  urticaceae: 'tropicalFoliage',
  piperaceae: 'tropicalFoliage',
  begoniaceae: 'tropicalFoliage',
  araliaceae: 'tropicalFoliage',
  commelinaceae: 'tropicalFoliage',

  // ---- Samambaias e plantas de sombra --------------------------------------
  // PPG I families named in the cultivation lists of the dossier.
  nephrolepidaceae: 'fern',
  pteridaceae: 'fern',
  aspleniaceae: 'fern',
  dryopteridaceae: 'fern',
  davalliaceae: 'fern',
  polypodiaceae: 'fern',
  lygodiaceae: 'fern',
  dicksoniaceae: 'fern',
  cyatheaceae: 'fern',
  blechnaceae: 'fern',
  athyriaceae: 'fern',
  thelypteridaceae: 'fern',
  osmundaceae: 'fern',
  selaginellaceae: 'fern', // a lycophyte, not a fern - same moisture regime

  // ---- Frutiferas e hortalicas (garden scale) ------------------------------
  rosaceae: 'fruitVeg',
  solanaceae: 'fruitVeg',
  cucurbitaceae: 'fruitVeg',
  brassicaceae: 'fruitVeg',
  amaryllidaceae: 'fruitVeg',
  rutaceae: 'fruitVeg',
  caricaceae: 'fruitVeg',
  passifloraceae: 'fruitVeg',
  musaceae: 'fruitVeg',
  vitaceae: 'fruitVeg',
  annonaceae: 'fruitVeg',
  malpighiaceae: 'fruitVeg',
  anacardiaceae: 'fruitVeg',
  convolvulaceae: 'fruitVeg',

  // ---- Floriferas e ornamentais -------------------------------------------
  asteraceae: 'flowering',
  balsaminaceae: 'flowering',
  plantaginaceae: 'flowering',
  violaceae: 'flowering',
  ranunculaceae: 'flowering',
  liliaceae: 'flowering',
  iridaceae: 'flowering',
  gesneriaceae: 'flowering',
  hemerocallidaceae: 'flowering',
  primulaceae: 'flowering',
  caryophyllaceae: 'flowering',

  // ---- Arvores e arbustos lenhosos ----------------------------------------
  fagaceae: 'woody',
  sapindaceae: 'woody',
  betulaceae: 'woody',
  cornaceae: 'woody',
  lythraceae: 'woody',
  pinaceae: 'woody',
  cupressaceae: 'woody',
  ericaceae: 'woody', // Vaccinium leaves via TAXON, by the organ harvested
  hydrangeaceae: 'woody',
  oleaceae: 'woody',
  buxaceae: 'woody',
  theaceae: 'woody',
  myrtaceae: 'woody',
  salicaceae: 'woody',
  bignoniaceae: 'woody',
  magnoliaceae: 'woody',
  altingiaceae: 'woody',
  ulmaceae: 'woody',
  juglandaceae: 'woody',
  tiliaceae: 'woody',
  taxaceae: 'woody',
  araucariaceae: 'woody',

  // ---- Orquideas e epifitas ------------------------------------------------
  orchidaceae: 'orchid',
  bromeliaceae: 'orchid',

  // ---- Ervas aromaticas ----------------------------------------------------
  lamiaceae: 'herb', // family-anchor of the dossier; ornamentals via TAXON
  apiaceae: 'herb', // Daucus/Apium leave via TAXON
  lauraceae: 'herb', // Laurus nobilis
  zingiberaceae: 'herb',

  // ---- Insetos polinizadores ----------------------------------------------
  apidae: 'pollinator',
  andrenidae: 'pollinator',
  colletidae: 'pollinator',
  halictidae: 'pollinator',
  megachilidae: 'pollinator',
  melittidae: 'pollinator',
  syrphidae: 'pollinator', // adult on a flower is what gets photographed
  bombyliidae: 'pollinator',
  papilionidae: 'pollinator',
  nymphalidae: 'pollinator',
  hesperiidae: 'pollinator',
  pieridae: 'pollinator',
  lycaenidae: 'pollinator',
  riodinidae: 'pollinator',
  sphingidae: 'pollinator', // hawk moths, named as pollinators in the dossier

  // ---- Insetos predadores e beneficos -------------------------------------
  coccinellidae: 'beneficialInsect', // Epilachna leaves via TAXON
  carabidae: 'beneficialInsect',
  cicindelidae: 'beneficialInsect',
  reduviidae: 'beneficialInsect', // Triatominae leave via TAXON
  chrysopidae: 'beneficialInsect',
  hemerobiidae: 'beneficialInsect',
  asilidae: 'beneficialInsect',
  mantidae: 'beneficialInsect',
  ichneumonidae: 'beneficialInsect',
  braconidae: 'beneficialInsect',
  tachinidae: 'beneficialInsect',
  sphecidae: 'beneficialInsect',
  crabronidae: 'beneficialInsect',
  scoliidae: 'beneficialInsect',
  vespidae: 'beneficialInsect', // predator in the dossier; sting note in safety
  anthocoridae: 'beneficialInsect',
  nabidae: 'beneficialInsect',
  geocoridae: 'beneficialInsect',
  cantharidae: 'beneficialInsect',
  forficulidae: 'beneficialInsect',

  // ---- Insetos-praga comuns ------------------------------------------------
  aphididae: 'pestInsect',
  aleyrodidae: 'pestInsect',
  coreidae: 'pestInsect',
  pentatomidae: 'pestInsect',
  cicadellidae: 'pestInsect',
  coccidae: 'pestInsect',
  diaspididae: 'pestInsect',
  pseudococcidae: 'pestInsect',
  chrysomelidae: 'pestInsect',
  curculionidae: 'pestInsect',
  elateridae: 'pestInsect',
  cerambycidae: 'pestInsect',
  crambidae: 'pestInsect',
  pyralidae: 'pestInsect',
  sesiidae: 'pestInsect',
  plutellidae: 'pestInsect',
  noctuidae: 'pestInsect',
  gelechiidae: 'pestInsect',
  tortricidae: 'pestInsect',
  agromyzidae: 'pestInsect',
  tephritidae: 'pestInsect',
  thripidae: 'pestInsect',
  tetranychidae: 'pestInsect',
  termitidae: 'pestInsect',
  // Stinging caterpillars: a MEDICAL problem filed here because this is where
  // someone looks after meeting one (insetos-praga-comuns.md, "Divergencias").
  megalopygidae: 'pestInsect',
  limacodidae: 'pestInsect',

  // ---- Cogumelos -----------------------------------------------------------
  // Only the three families confirmed by a primary source in
  // cogumelos-micorrizicos.md. Every other fungal family in that dossier is
  // flagged there as an unverified gap, so it is NOT listed here - unknown
  // mushroom families fall through to null rather than guessing.
  amanitaceae: 'mycorrhizalFungus',
  boletaceae: 'mycorrhizalFungus',
  cortinariaceae: 'mycorrhizalFungus',

  // ---- Peixes de agua doce -------------------------------------------------
  characidae: 'freshwaterFish',
  serrasalmidae: 'freshwaterFish',
  anostomidae: 'freshwaterFish',
  prochilodontidae: 'freshwaterFish',
  curimatidae: 'freshwaterFish',
  erythrinidae: 'freshwaterFish',
  bryconidae: 'freshwaterFish',
  cynodontidae: 'freshwaterFish',
  acestrorhynchidae: 'freshwaterFish',
  parodontidae: 'freshwaterFish',
  hemiodontidae: 'freshwaterFish',
  loricariidae: 'freshwaterFish',
  pimelodidae: 'freshwaterFish',
  callichthyidae: 'freshwaterFish',
  doradidae: 'freshwaterFish',
  heptapteridae: 'freshwaterFish',
  trichomycteridae: 'freshwaterFish',
  auchenipteridae: 'freshwaterFish',
  ictaluridae: 'freshwaterFish',
  clariidae: 'freshwaterFish',
  pseudopimelodidae: 'freshwaterFish',
  cyprinidae: 'freshwaterFish',
  leuciscidae: 'freshwaterFish',
  catostomidae: 'freshwaterFish',
  cobitidae: 'freshwaterFish',
  gymnotidae: 'freshwaterFish',
  sternopygidae: 'freshwaterFish',
  apteronotidae: 'freshwaterFish',
  hypopomidae: 'freshwaterFish',
  rhamphichthyidae: 'freshwaterFish',
  cichlidae: 'freshwaterFish',
  centrarchidae: 'freshwaterFish',
  percidae: 'freshwaterFish',
  esocidae: 'freshwaterFish',
  salmonidae: 'freshwaterFish',
  poeciliidae: 'freshwaterFish',
  rivulidae: 'freshwaterFish',
  cyprinodontidae: 'freshwaterFish',
  anablepidae: 'freshwaterFish',
  osteoglossidae: 'freshwaterFish',
  arapaimidae: 'freshwaterFish',
  lepisosteidae: 'freshwaterFish',
  synbranchidae: 'freshwaterFish',
  acipenseridae: 'freshwaterFish',
  potamotrygonidae: 'freshwaterFish',

  // ---- Peixes marinhos e recifais -----------------------------------------
  acanthuridae: 'marineFish',
  chaetodontidae: 'marineFish',
  pomacanthidae: 'marineFish',
  lutjanidae: 'marineFish',
  haemulidae: 'marineFish',
  sciaenidae: 'marineFish', // freshwater drums exist; marine is the common case
  sparidae: 'marineFish',
  mullidae: 'marineFish',
  pomacentridae: 'marineFish',
  blenniidae: 'marineFish',
  chaenopsidae: 'marineFish',
  labridae: 'marineFish',
  gobiidae: 'marineFish',
  microdesmidae: 'marineFish',
  balistidae: 'marineFish',
  monacanthidae: 'marineFish',
  ostraciidae: 'marineFish',
  tetraodontidae: 'marineFish',
  diodontidae: 'marineFish',
  holocentridae: 'marineFish',
  muraenidae: 'marineFish',
  congridae: 'marineFish',
  syngnathidae: 'marineFish',
  aulostomidae: 'marineFish',
  fistulariidae: 'marineFish',
  serranidae: 'marineFish',
  grammatidae: 'marineFish',
  priacanthidae: 'marineFish',
  apogonidae: 'marineFish',
  cirrhitidae: 'marineFish',
  scorpaenidae: 'marineFish',
  pteroidae: 'marineFish',
  carangidae: 'marineFish',
  coryphaenidae: 'marineFish',
  echeneidae: 'marineFish',
  paralichthyidae: 'marineFish',
  bothidae: 'marineFish',
  soleidae: 'marineFish',
  scombridae: 'marineFish',
  istiophoridae: 'marineFish',
  xiphiidae: 'marineFish',
  clupeidae: 'marineFish',
  engraulidae: 'marineFish',
  mugilidae: 'marineFish',
  belonidae: 'marineFish',
  exocoetidae: 'marineFish',
  hemiramphidae: 'marineFish',
  gadidae: 'marineFish',
  merlucciidae: 'marineFish',
  lophiidae: 'marineFish',
  antennariidae: 'marineFish',
  linophrynidae: 'marineFish',
  batrachoididae: 'marineFish',
  carcharhinidae: 'marineFish',
  sphyrnidae: 'marineFish',
  ginglymostomatidae: 'marineFish',
  lamnidae: 'marineFish',
  rhincodontidae: 'marineFish',
  dasyatidae: 'marineFish',
  myliobatidae: 'marineFish',
  mobulidae: 'marineFish',
  rhinobatidae: 'marineFish',
  urotrygonidae: 'marineFish',

  // ---- Aves ----------------------------------------------------------------
  // Thirteen families appear in BOTH bird dossiers (Turdidae, Furnariidae,
  // Thraupidae, Psittacidae...). They resolve to gardenBird because a user
  // photographing a bird is far more often in a yard or a park than inside
  // continuous forest, and the garden manual is the safer of the two to show.
  passeridae: 'gardenBird',
  sturnidae: 'gardenBird',
  turdidae: 'gardenBird',
  thraupidae: 'gardenBird',
  fringillidae: 'gardenBird',
  cardinalidae: 'gardenBird',
  icteridae: 'gardenBird',
  tyrannidae: 'gardenBird',
  furnariidae: 'gardenBird',
  hirundinidae: 'gardenBird',
  mimidae: 'gardenBird',
  corvidae: 'gardenBird',
  paridae: 'gardenBird',
  troglodytidae: 'gardenBird',
  estrildidae: 'gardenBird',
  motacillidae: 'gardenBird',
  columbidae: 'gardenBird',
  trochilidae: 'gardenBird',
  apodidae: 'gardenBird',
  psittacidae: 'gardenBird',
  picidae: 'gardenBird',
  strigidae: 'gardenBird',
  tytonidae: 'gardenBird',
  falconidae: 'gardenBird',
  accipitridae: 'gardenBird',
  cathartidae: 'gardenBird',
  laridae: 'gardenBird',
  charadriidae: 'gardenBird',
  phasianidae: 'gardenBird',
  // Forest-exclusive and migratory-exclusive families.
  // Anatidae and Ardeidae belong HERE, not above: neither appears in the
  // "quem entra neste grupo" tables of aves-de-jardim-e-urbanas.md, and both
  // are listed by name in aves-de-mata-e-migratorias.md among the families
  // relevant on the migratory axis. The garden manual is a bird-feeder manual
  // (seed, hygiene, cats) and has nothing to say to someone looking at a heron
  // or a duck on the water.
  anatidae: 'forestBird',
  ardeidae: 'forestBird',
  ramphastidae: 'forestBird',
  bucconidae: 'forestBird',
  galbulidae: 'forestBird',
  capitonidae: 'forestBird',
  cracidae: 'forestBird',
  tinamidae: 'forestBird',
  thamnophilidae: 'forestBird',
  dendrocolaptidae: 'forestBird',
  pipridae: 'forestBird',
  cotingidae: 'forestBird',
  tityridae: 'forestBird',
  grallariidae: 'forestBird',
  formicariidae: 'forestBird',
  rhinocryptidae: 'forestBird',
  conopophagidae: 'forestBird',
  melanopareiidae: 'forestBird',
  trogonidae: 'forestBird',
  momotidae: 'forestBird',
  nyctibiidae: 'forestBird',
  caprimulgidae: 'forestBird',
  vireonidae: 'forestBird',
  parulidae: 'forestBird',
  scolopacidae: 'forestBird',
  procellariidae: 'forestBird',
  diomedeidae: 'forestBird',
  stercorariidae: 'forestBird',
  cuculidae: 'forestBird',
};

// Estes dois grupos carregam semantica de cultivo e colheita. A familia nao
// prova que a planta e alimento ou erva: Solanaceae inclui beladona e Datura;
// Apiaceae inclui cicuta; Rosaceae inclui ornamentais. So uma entrada positiva
// em TAXON pode abrir esses dossies.
const TAXON_ONLY_GROUPS = new Set(['fruitVeg', 'herb']);

/**
 * Order -> group, used only when the family is unknown or unmapped.
 * Fish orders carry real signal (peixes-de-agua-doce.md opens by saying the app
 * should look at "ordem antes de familia" for the Neotropical fauna), and a few
 * insect orders are effectively single-group. Bird and plant orders are NOT
 * listed: Passeriformes spans both bird groups and Asterales spans three plant
 * groups, so an order match there would be a coin flip.
 */
const ORDER = {
  // Insects
  odonata: 'beneficialInsect',
  mantodea: 'beneficialInsect',
  neuroptera: 'beneficialInsect',
  trombidiformes: 'pestInsect',
  acari: 'pestInsect',
  // Freshwater fish orders
  characiformes: 'freshwaterFish',
  siluriformes: 'freshwaterFish',
  cypriniformes: 'freshwaterFish',
  gymnotiformes: 'freshwaterFish',
  cichliformes: 'freshwaterFish',
  centrarchiformes: 'freshwaterFish',
  esociformes: 'freshwaterFish',
  salmoniformes: 'freshwaterFish',
  cyprinodontiformes: 'freshwaterFish',
  osteoglossiformes: 'freshwaterFish',
  lepisosteiformes: 'freshwaterFish',
  synbranchiformes: 'freshwaterFish',
  acipenseriformes: 'freshwaterFish',
  // Marine fish orders
  acanthuriformes: 'marineFish',
  blenniiformes: 'marineFish',
  labriformes: 'marineFish',
  gobiiformes: 'marineFish',
  tetraodontiformes: 'marineFish',
  holocentriformes: 'marineFish',
  anguilliformes: 'marineFish',
  syngnathiformes: 'marineFish',
  scorpaeniformes: 'marineFish',
  carangiformes: 'marineFish',
  scombriformes: 'marineFish',
  mugiliformes: 'marineFish',
  beloniformes: 'marineFish',
  gadiformes: 'marineFish',
  lophiiformes: 'marineFish',
  batrachoidiformes: 'marineFish',
  pleuronectiformes: 'marineFish',
};

/**
 * Resolve the curated group for an identified entity.
 *
 * @param {{category?: string, family?: string, ord?: string, scientific?: string}} entity
 * @returns {string|null} one of the 19 group keys in {lang}-groups.json, or
 *          null when the taxonomy is missing or genuinely ambiguous.
 */
export function getSpeciesGroup(entity) {
  if (!entity) return null;

  const category = norm(entity.category);
  const family = norm(entity.family);
  const ord = norm(entity.ord);
  const scientific = norm(entity.scientific);

  // A commercial field is a different manual from a backyard bed, so `crop`
  // answers from its OWN exact taxon allowlist and stops there.
  //
  // It has to run before TAXON, not after: TAXON only knows garden and
  // houseplant cases, and its `lactuca`, `daucus`, `apium`, `allium` and
  // `cichorium` keys are precisely the biggest vegetable crops there are. With
  // the genus checked first, a field of *Lactuca sativa* was reading the
  // backyard manual (frutiferas-e-hortalicas.md) instead of the field one
  // (lavouras-hortalicas-e-frutiferas.md) - different scale, different
  // irrigation, different rotation.
  //
  // A curta CROP_TAXON e uma allowlist positiva: o nome cientifico precisa
  // estar coberto pelo dossie. Familia nunca abre manejo de lavoura, porque
  // Poaceae nao transforma cana em milho e Malvaceae nao transforma algodao
  // em hortalica. Entradas null documentam vetos importantes.
  if (category === 'crop') {
    // Sem binomio nao ha como aplicar os vetos por cultura. Usar so familia
    // faria cana virar cereal e algodao virar hortalica.
    if (!scientific || scientific.split(/\s+/).length < 2) return null;
    const binomial = binomialOf(scientific);
    if (hasOwn(CROP_TAXON, binomial)) return CROP_TAXON[binomial];
    const genus = scientific.split(/\s+/)[0];
    if (hasOwn(CROP_TAXON, genus)) return CROP_TAXON[genus];
    return null;
  }

  // Binomial first, then genus. `scientific` is "Genus species" for every
  // category that sends it; anything else simply misses both lookups.
  if (scientific) {
    const binomial = binomialOf(scientific);
    if (hasOwn(TAXON, binomial)) return TAXON[binomial];
    const genus = scientific.split(/\s+/)[0];
    if (hasOwn(TAXON, genus)) return TAXON[genus];
  }

  if (FAMILY_BY_CATEGORY[family]) return FAMILY_BY_CATEGORY[family][category] || null;

  const familyGroup = FAMILY[family];
  if (TAXON_ONLY_GROUPS.has(familyGroup)) return null;
  if (familyGroup) return familyGroup;
  if (ORDER[ord]) return ORDER[ord];

  // Deliberately NO category fallback. A mushroom whose family is unknown is
  // NOT assumed to be a decomposer: cogumelos-decompositores.md warns that its
  // sources never worked at family level and that the family table must be
  // verified before being fixed, and the mycorrhizal dossier holds the lethal
  // Amanitaceae. Guessing "decomposer" would attach the cultivation-and-lawn
  // advice to a deadly species. Same logic for fish, birds and plants: no
  // family, no group.
  return null;
}

/**
 * One runnable check for the resolution ORDER, which is the only real logic in
 * this file - the tables themselves are data. Every case below fails loudly if
 * a rung of the ladder is reordered or dropped.
 *
 *   node -e "import('./components/speciesGroup.js').then(m => m.selfCheck())"
 */
export function selfCheck() {
  const eq = (got, want, msg) => {
    if (got !== want) throw new Error(`${msg}: expected ${want}, got ${got}`);
  };

  // Family is the normal path, and case/whitespace must not matter.
  eq(getSpeciesGroup({ category: 'plant', family: 'Cactaceae' }), 'succulent', 'family');
  eq(getSpeciesGroup({ category: 'plant', family: '  cactaceae ' }), 'succulent', 'family norm');
  eq(getSpeciesGroup({ category: 'insect', family: 'Coccinellidae' }), 'beneficialInsect', 'insect family');

  // Genus overrides family (the documented misclassification cases).
  eq(
    getSpeciesGroup({ category: 'plant', family: 'Araceae', scientific: 'Zamioculcas zamiifolia' }),
    'succulent',
    'genus beats family'
  );
  eq(
    getSpeciesGroup({ category: 'plant', family: 'Cactaceae', scientific: 'Schlumbergera truncata' }),
    'orchid',
    'epiphytic cactus'
  );
  eq(
    getSpeciesGroup({ category: 'insect', family: 'Reduviidae', scientific: 'Triatoma infestans' }),
    'pestInsect',
    'Triatominae'
  );
  eq(getSpeciesGroup({ category: 'insect', family: 'Formicidae', scientific: 'Atta sexdens' }), 'pestInsect', 'leafcutter ant');
  eq(getSpeciesGroup({ category: 'insect', family: 'Formicidae', scientific: 'Linepithema humile' }), null, 'other ants fail closed');
  eq(getSpeciesGroup({ category: 'insect', family: 'Scarabaeidae', scientific: 'Scarabaeus sacer' }), null, 'scarabs fail closed');
  eq(getSpeciesGroup({ category: 'insect', family: 'Saturniidae', scientific: 'Lonomia obliqua' }), 'pestInsect', 'Lonomia obliqua');
  eq(getSpeciesGroup({ category: 'insect', family: 'Saturniidae', scientific: 'Automeris io' }), null, 'other saturniids fail closed');

  // Binomial beats genus (Ficus is a houseplant and a fruit tree).
  eq(getSpeciesGroup({ category: 'plant', family: 'Moraceae', scientific: 'Ficus lyrata' }), 'tropicalFoliage', 'Ficus houseplant');
  eq(getSpeciesGroup({ category: 'plant', family: 'Moraceae', scientific: 'Ficus carica' }), 'fruitVeg', 'Ficus fig');
  eq(getSpeciesGroup({ category: 'plant', family: 'Rosaceae', scientific: 'Malus domestica' }), 'fruitVeg', 'apple');
  eq(getSpeciesGroup({ category: 'tree', family: 'Anacardiaceae', scientific: 'Mangifera indica' }), 'fruitVeg', 'mango');
  eq(getSpeciesGroup({ category: 'plant', family: 'Lauraceae', scientific: 'Persea americana' }), 'fruitVeg', 'avocado');
  eq(getSpeciesGroup({ category: 'tree', family: 'Rosaceae', scientific: 'Prunus serrulata' }), null, 'ornamental cherry stays out');

  // An epiphytic cactus is NOT a desert cactus - same family, opposite water
  // regime (suculentas-e-cactos.md: "manejo oposto"). Both directions checked,
  // so collapsing them back into one group fails here.
  const desert = getSpeciesGroup({ category: 'plant', family: 'Cactaceae', scientific: 'Echinocactus grusonii' });
  const forest = getSpeciesGroup({ category: 'plant', family: 'Cactaceae', scientific: 'Schlumbergera truncata' });
  eq(desert, 'succulent', 'desert cactus');
  eq(forest, 'orchid', 'forest cactus');
  if (desert === forest) throw new Error('epiphytic cactus resolved to the desert group');
  eq(getSpeciesGroup({ category: 'plant', family: 'Cactaceae', scientific: 'Rhipsalis baccifera' }), 'orchid', 'Rhipsalis');

  // Lavoura exige nome cientifico coberto. Familia sozinha nunca vira
  // protocolo: e exatamente assim que cana parecia milho e algodao hortalica.
  eq(getSpeciesGroup({ category: 'crop', family: 'Poaceae' }), null, 'crop family only');
  eq(getSpeciesGroup({ category: 'crop', family: 'Solanaceae' }), null, 'crop solanaceae only');
  eq(getSpeciesGroup({ category: 'crop', family: 'Lamiaceae' }), null, 'crop lamiaceae only');
  eq(
    getSpeciesGroup({ category: 'crop', family: 'Poaceae', scientific: 'Saccharum officinarum' }),
    null,
    'sugarcane is not a cereal'
  );
  eq(
    getSpeciesGroup({ category: 'crop', family: 'Malvaceae', scientific: 'Gossypium hirsutum' }),
    null,
    'cotton is not a vegetable crop'
  );
  eq(
    getSpeciesGroup({ category: 'crop', family: 'Asteraceae', scientific: 'Helianthus annuus' }),
    'grainCrop',
    'sunflower is an oilseed crop'
  );
  eq(
    getSpeciesGroup({ category: 'crop', scientific: 'Manihot esculenta' }),
    'vegCrop',
    'known crop taxon works without family'
  );
  eq(getSpeciesGroup({ category: 'plant', family: 'Solanaceae' }), null, 'garden solanaceae needs taxon');
  eq(
    getSpeciesGroup({ category: 'crop', family: 'Asteraceae', scientific: 'Lactuca sativa' }),
    'vegCrop',
    'crop beats the garden genus'
  );
  eq(getSpeciesGroup({ category: 'crop', scientific: 'Lactuca sativa' }), 'vegCrop', 'exact crop without family');

  // Waterfowl read the migratory manual, not the bird-feeder one.
  eq(getSpeciesGroup({ category: 'bird', family: 'Ardeidae' }), 'forestBird', 'heron');
  eq(getSpeciesGroup({ category: 'bird', family: 'Anatidae' }), 'forestBird', 'duck');
  eq(getSpeciesGroup({ category: 'bird', family: 'Turdidae' }), 'gardenBird', 'thrush stays a garden bird');

  // Cabbage white: pest by binomial, while the family stays a pollinator and
  // the homonym shrub genus is untouched.
  eq(
    getSpeciesGroup({ category: 'insect', family: 'Pieridae', scientific: 'Pieris rapae' }),
    'pestInsect',
    'Pieris rapae'
  );
  eq(getSpeciesGroup({ category: 'insect', family: 'Pieridae', scientific: 'Colias croceus' }), 'pollinator', 'other Pieridae');
  eq(getSpeciesGroup({ category: 'plant', family: 'Ericaceae', scientific: 'Pieris japonica' }), 'woody', 'Pieris the shrub');

  // Pineapple is food, not an epiphyte, on both scales.
  eq(getSpeciesGroup({ category: 'plant', family: 'Bromeliaceae', scientific: 'Ananas comosus' }), 'fruitVeg', 'pineapple');
  eq(getSpeciesGroup({ category: 'crop', family: 'Bromeliaceae', scientific: 'Ananas comosus' }), 'vegCrop', 'pineapple field');
  eq(getSpeciesGroup({ category: 'plant', family: 'Bromeliaceae', scientific: 'Tillandsia usneoides' }), 'orchid', 'air plant');

  // Families that answer only for one category, and stay silent for the other.
  eq(getSpeciesGroup({ category: 'plant', family: 'Arecaceae' }), 'tropicalFoliage', 'indoor palm');
  eq(getSpeciesGroup({ category: 'tree', family: 'Arecaceae' }), null, 'grown palm');
  eq(getSpeciesGroup({ category: 'tree', family: 'Fabaceae' }), 'woody', 'legume tree');
  eq(getSpeciesGroup({ category: 'plant', family: 'Fabaceae' }), null, 'legume in a bed');

  // Deliberate gaps: a group here would be a wrong manual, not a missing one.
  eq(getSpeciesGroup({ category: 'plant', family: 'Euphorbiaceae' }), null, 'Euphorbiaceae stays unmapped');
  eq(getSpeciesGroup({ category: 'plant', family: 'Poaceae' }), null, 'Poaceae stays unmapped');

  // Order is the fallback, never a shortcut past a known family.
  eq(getSpeciesGroup({ category: 'fish', ord: 'Characiformes' }), 'freshwaterFish', 'order fallback');
  eq(getSpeciesGroup({ category: 'fish', family: 'Cichlidae', ord: 'Acanthuriformes' }), 'freshwaterFish', 'family wins over order');

  // Honest nulls.
  eq(getSpeciesGroup(null), null, 'null entity');
  eq(getSpeciesGroup({}), null, 'empty entity');
  eq(getSpeciesGroup({ category: 'mushroom' }), null, 'mushroom without family stays null');
  eq(getSpeciesGroup({ category: 'bird', family: 'Nonexistentidae' }), null, 'unknown family');

  return 'speciesGroup: all checks passed';
}
