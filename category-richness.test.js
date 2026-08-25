// Contrato das telas que nao sao Planta/Arvore: mais conteudo quando existe,
// nenhum cuidado vegetal quando o dado nao existe.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const { uiLocaleFiles } = require('./test-locales');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

function loadCuratedDetails() {
  const file = path.join(__dirname, 'components', 'curatedDetails.js');
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const fakeRequire = (name) => {
    if (name === './speciesDetails') {
      return { getSpeciesDetail: async (_language, id) => ({ marker: id }) };
    }
    return require(name);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

function loadExpoModule(relativePath, stubs = {}) {
  const file = path.join(__dirname, relativePath);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const fakeRequire = (name) => (name in stubs ? stubs[name] : require(name));
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

const CURATED = {
  fish: [
    ['Amphiprion ocellaris', 'clownfish'], ['Oncorhynchus mykiss', 'rainbowTrout'],
    ['Salmo salar', 'atlanticSalmon'], ['Esox lucius', 'northernPike'],
    ['Cyprinus carpio', 'commonCarp'], ['Paracanthurus hepatus', 'blueTang'],
    ['Micropterus salmoides', 'largemouthBass'], ['Thunnus albacares', 'yellowfinTuna'],
    ['Danio rerio', 'zebrafish'], ['Pterois volitans', 'redLionfish'],
  ],
  bird: [
    ['Hirundo rustica', 'barnSwallow'], ['Passer domesticus', 'houseSparrow'],
    ['Alcedo atthis', 'commonKingfisher'], ['Falco peregrinus', 'peregrineFalcon'],
    ['Ardea herodias', 'greatBlueHeron'], ['Columba livia', 'rockPigeon'],
    ['Erithacus rubecula', 'europeanRobin'], ['Anas platyrhynchos', 'mallard'],
    ['Ara macao', 'scarletMacaw'], ['Aptenodytes forsteri', 'emperorPenguin'],
  ],
  crop: [
    ['Zea mays', 'maize'], ['Manihot esculenta', 'cassava'],
    ['Coffea arabica', 'arabicaCoffee'], ['Glycine max', 'soybean'],
    ['Saccharum officinarum', 'sugarcane'], ['Triticum aestivum', 'breadWheat'],
    ['Oryza sativa', 'asianRice'], ['Solanum tuberosum', 'potato'],
    ['Musa acuminata', 'banana'], ['Citrus × sinensis', 'sweetOrange'],
  ],
  insect: [
    ['Coccinella septempunctata', 'sevenSpotLadybird'], ['Forficula auricularia', 'commonEarwig'],
    ['Armadillidium vulgare', 'commonPillWoodlouse'], ['Musca domestica', 'houseFly'],
    ['Cornu aspersum', 'gardenSnail'], ['Apis mellifera', 'westernHoneyBee'],
    ['Vanessa cardui', 'paintedLady'], ['Pholcus phalangioides', 'cellarSpider'],
    ['Linepithema humile', 'argentineAnt'], ['Lumbricus terrestris', 'commonEarthworm'],
  ],
  mushroom: [
    ['Amanita muscaria', 'flyAgaric'], ['Amanita phalloides', 'deathCap'],
    ['Agaricus bisporus', 'buttonMushroom'], ['Saccharomyces cerevisiae', 'brewersYeast'],
    ['Ophiocordyceps unilateralis', 'zombieAntFungus'], ['Armillaria ostoyae', 'humongousFungus'],
    ['Panellus stipticus', 'bitterOyster'], ['Penicillium rubens', 'penicilliumMould'],
    ['Batrachochytrium dendrobatidis', 'chytridFungus'], ['Tuber magnatum', 'whiteTruffle'],
  ],
  sound: [
    ['Strix aluco', 'tawnyOwl'], ['Cuculus canorus', 'commonCuckoo'],
    ['Luscinia megarhynchos', 'commonNightingale'], ['Hyla arborea', 'europeanTreeFrog'],
    ['Lithobates catesbeianus', 'americanBullfrog'], ['Cicada orni', 'cicadaOrni'],
    ['Acheta domesticus', 'houseCricket'], ['Tettigonia viridissima', 'greatGreenBushCricket'],
    ['Alouatta caraya', 'blackHowlerMonkey'], ['Vulpes vulpes', 'redFox'],
  ],
};

test('the 60 curated species resolve only by their exact scientific identity', async () => {
  const { curatedDetailId, getCuratedDetail } = loadCuratedDetails();
  const discover = JSON.parse(read('public/locales/en.json')).discover.topics;
    const discoverKeys = {
      fish: 'oceanAndRiverFish',
      bird: 'birdsOfTheWorld',
      crop: 'fromFieldToPlate',
      insect: 'gardenInsects',
      mushroom: 'fungiOfTheWorld',
      sound: 'heardNotSeen',
  };
  for (const [category, rows] of Object.entries(CURATED)) {
    const publishedRows = discover[discoverKeys[category]].species.map(({ sci, id }) => [sci, id]);
    assert.deepEqual(rows, publishedRows, `${category}: resolver must match the Discover catalogue`);
    for (const [scientific, id] of rows) {
      assert.equal(curatedDetailId(category, scientific), id, `${category}: ${scientific}`);
      const detail = await getCuratedDetail('pt', category, scientific);
      assert.equal(detail.marker, id);
      assert.ok(detail.scientific, `${category}: ${id} must carry a canonical scientific name`);
    }
  }
  assert.equal(curatedDetailId('sound', '  STRIX   ALUCO '), 'tawnyOwl');
  assert.equal(curatedDetailId('fish', 'Pterois volitans (Linnaeus, 1758)'), 'redLionfish');
  assert.equal(curatedDetailId('insect', 'Apis mellifera Linnaeus'), 'westernHoneyBee');
  assert.equal(curatedDetailId('crop', 'Citrus x sinensis'), 'sweetOrange');
  assert.equal(curatedDetailId('sound', 'Tawny owl'), null, 'a common name is not a scientific join key');
  assert.equal(curatedDetailId('sound', 'Unknown species'), null, 'unknown species fail closed');
});

test('bird and sound wire their real curated identities into scientific blocks', () => {
  const bird = read('screens/BirdDetailScreen.js');
  assert.match(bird, /scientificForBirdLabel\(plant\.name\)/);
  assert.match(bird, /<DistributionMap scientific=\{resolvedScientific\}/);
  assert.match(bird, /<SeasonChart scientific=\{resolvedScientific\}/);
  assert.match(bird, /scientific=\{resolvedScientific\}/);

  const sound = read('screens/SoundDetailScreen.js');
  assert.match(sound, /getCuratedDetail\(i18n\.language, 'sound'/);
  assert.match(sound, /<DistributionMap scientific=\{plant\.scientific\}/);
  assert.match(sound, /<SeasonChart scientific=\{plant\.scientific\}/);
  assert.doesNotMatch(sound, /getCuratedBird/);
});

test('generic bird labels never become a specific European species', () => {
  const birds = loadExpoModule('components/curatedBirds.js', {
    './speciesDetails': { getSpeciesDetails: async () => null },
    './curatedDetails': { curatedScientific: () => null },
  });
  assert.equal(birds.birdIdFromLabel('Robin'), null);
  assert.equal(birds.birdIdFromLabel('Kingfisher'), null);
  assert.equal(birds.birdIdFromLabel(' European   Robin '), 'europeanRobin');
  assert.equal(birds.birdIdFromLabel('common kingfisher'), 'commonKingfisher');
});

test('seasonality is present only where it is observationally honest', () => {
  for (const file of [
    'screens/MushroomDetailScreen.js',
    'screens/InsectDetailScreen.js',
    'screens/BirdDetailScreen.js',
    'screens/FishDetailScreen.js',
    'screens/SoundDetailScreen.js',
  ]) {
    assert.match(read(file), /<SeasonChart scientific=/, `${file} must use real GBIF records`);
  }
  assert.doesNotMatch(
    read('screens/CropDetailScreen.js'),
    /SeasonChart/,
    'GBIF observation months must not be presented as a crop calendar'
  );
  assert.match(read('components/SeasonChart.js'), /setMonths\(null\)/, 'species changes must clear stale months');

  const enNote = JSON.parse(read('public/locales/en.json')).detail.seasonChartNote;
  const ptNote = JSON.parse(read('public/locales/pt.json')).detail.seasonChartNote;
  assert.doesNotMatch(enNote, /flower|activity/i, 'English copy must not imply flowering or animal activity');
  assert.doesNotMatch(ptNote, /flora[cç][aã]o|atividade/i, 'Portuguese copy must remain category-neutral');
});

test('wildlife and fungus screens never import plant-care components', () => {
  const forbidden = /CareSchedule|CareConditions|SpeciesCareCard|MonthInstructions|CareProfile|CommonProblems/;
  for (const file of [
    'screens/MushroomDetailScreen.js',
    'screens/InsectDetailScreen.js',
    'screens/BirdDetailScreen.js',
    'screens/FishDetailScreen.js',
    'screens/SoundDetailScreen.js',
  ]) {
    assert.doesNotMatch(read(file), forbidden, `${file} must not invent plant care`);
  }
});

test('group guides are explicit and never mix the plant manual into fauna or crops', () => {
  const careTopics = read('screens/CareTopicsScreen.js');
  const guideCard = read('components/GroupGuideCard.js');
  assert.match(careTopics, /UNIVERSAL_MANUAL_CATEGORIES = new Set\(\['plant', 'tree'\]\)/);
  assert.match(careTopics, /UNIVERSAL_MANUAL_CATEGORIES\.has\(category\) && !!meta\.art/,
    'plant artwork must not frame fauna, fungi or crop guidance');
  assert.match(careTopics, /tp\.text \|\| tp\.groupOnly/);
  assert.match(careTopics, /groupGuideNote[^\n]+groupManual\.label/);
  assert.match(guideCard, /groupGuideNote[^\n]+group\.label/);
  assert.match(guideCard, /common\.identified[^\n]+entityName/);
  assert.match(careTopics, /\[initialKey, topics, category\]/, 'topic changes must resynchronise the active tab');
  assert.match(
    careTopics,
    /\[activeKey, canonKey, i18nLang, groupKey, initialKey, initialProblem, category\]/,
    'changing category must clear the previous universal manual'
  );

  const locales = uiLocaleFiles();
  assert.equal(locales.length, 17);
  for (const file of locales) {
    const json = JSON.parse(read(path.join('public/locales', file)));
    assert.match(json.detail.groupGuideNote, /\{\{group\}\}/, `${file}: groupGuideNote must name the group`);
    assert.ok(json.detail.generalGuideNote, `${file}: general guides need an explicit scope note`);
  }

  assert.match(read('screens/InsectDetailScreen.js'),
    /<GroupGuideCard[\s\S]{0,180}entityName=\{enrichmentScientific \? plant\.name : null\}/,
    'the insect group guide may name an entity only after exact identity');
  assert.match(read('screens/MushroomDetailScreen.js'),
    /<GroupGuideCard[\s\S]{0,180}entityName=\{plant\.name\}/,
    'the mushroom general guide must name the identified entity');
  assert.doesNotMatch(read('screens/CropDetailScreen.js'), /<GroupGuideCard/,
    'crop prose must not reopen a cross-crop manual');
  const fish = read('screens/FishDetailScreen.js');
  assert.match(fish, /const guideGroupKey = groupKey === 'freshwaterFish'/);
  assert.match(fish, /groupKey === 'marineFish' && REEF_GUIDE_SPECIES\.has\(binomial\)/);
  for (const scientific of ['amphiprion ocellaris', 'paracanthurus hepatus', 'pterois volitans']) {
    assert.match(fish, new RegExp(`'${scientific}'`), `${scientific} is a confirmed reef guide match`);
  }
  assert.doesNotMatch(fish.slice(fish.indexOf('const REEF_GUIDE_SPECIES'), fish.indexOf('export default')),
    /thunnus|yellowfin|scombridae/i, 'pelagic fish must fail closed');
});

test('ambiguous insect families fail closed while supported taxa keep their guide', () => {
  const { getSpeciesGroup, selfCheck } = loadExpoModule('components/speciesGroup.js');
  selfCheck();

  assert.equal(getSpeciesGroup({ category: 'insect', family: 'Formicidae' }), null);
  assert.equal(
    getSpeciesGroup({ category: 'insect', family: 'Formicidae', scientific: 'Linepithema humile' }),
    null
  );
  assert.equal(
    getSpeciesGroup({ category: 'insect', family: 'Formicidae', scientific: 'Atta sexdens' }),
    'pestInsect'
  );
  assert.equal(getSpeciesGroup({ category: 'insect', family: 'Scarabaeidae' }), null);
  assert.equal(
    getSpeciesGroup({ category: 'insect', family: 'Saturniidae', scientific: 'Automeris io' }),
    null
  );
  assert.equal(
    getSpeciesGroup({ category: 'insect', family: 'Saturniidae', scientific: 'Lonomia obliqua' }),
    'pestInsect'
  );
  assert.equal(
    getSpeciesGroup({ category: 'insect', family: 'Erebidae', scientific: 'Anticarsia gemmatalis' }),
    'pestInsect'
  );
  assert.equal(getSpeciesGroup({ category: 'insect', family: 'Erebidae' }), null);
});

test('plant-wide profiles and problem lists never masquerade as species facts', () => {
  for (const file of ['components/CareProfile.js', 'components/CommonProblems.js']) {
    const source = read(file);
    assert.match(source, /common\.identified/);
    assert.match(source, /detail\.generalGuideNote/);
  }
  for (const file of ['screens/PlantDetailScreen.js', 'screens/TreeDetailScreen.js']) {
    const source = read(file);
    assert.match(source, /<CareSchedule[^>]+entityName=\{plant\.name\}/);
    assert.match(source, /<SpeciesCareCard[\s\S]{0,140}entityName=\{plant\.name\}/);
    assert.match(source, /<CommonProblems[\s\S]{0,120}entityName=\{plant\.name\}/);
    assert.doesNotMatch(source, /plant\.overview \|\| t\('sound\.noContentBody'\)/,
      'missing species prose must hide the block, never show a placeholder');
  }

  const speciesCare = read('components/SpeciesCareCard.js');
  const groupBranch = speciesCare.slice(
    speciesCare.indexOf('const groupCard'),
    speciesCare.indexOf("if (layer === 'group')")
  );
  const exactBranch = speciesCare.slice(speciesCare.indexOf("if (layer === 'group')"));
  assert.match(groupBranch, /group\?\.label \|\| t\('detail\.fundamentals'\)/);
  assert.match(groupBranch, /detail\.groupGuideNote|detail\.generalGuideNote/);
  assert.doesNotMatch(groupBranch, /speciesCareSection|common\.identified|speciesCareNote/,
    'a fallback group must not claim to be care for this exact species');
  assert.match(exactBranch, /detail\.speciesCareSection/);
  assert.match(exactBranch, /common\.identified/);
  assert.match(exactBranch, /detail\.speciesCareNote/);
});

test('fish, insects and mushrooms enrich only exact curated matches', () => {
  const guide = read('components/ExactSpeciesGuide.js');
  assert.match(guide, /getCuratedDetail\(i18n\.language, category, scientific\)/);
  assert.match(guide, /common\.identified/);
  assert.match(guide, /if \(!detail\?\.scientific \|\| visible\.length === 0\) return null/);

  for (const [file, category] of [
    ['screens/FishDetailScreen.js', 'fish'],
    ['screens/InsectDetailScreen.js', 'insect'],
    ['screens/MushroomDetailScreen.js', 'mushroom'],
  ]) {
    const source = read(file);
    assert.match(source, new RegExp(`<ExactSpeciesGuide[\\s\\S]{0,120}category="${category}"`));
    assert.match(source, /scientific=\{plant\.scientific\}/);
  }
});

test('topic aliases have one canonical meaning in the card and the opened guide', () => {
  const { canonicalTopicKey } = loadExpoModule('components/topicKey.js');
  assert.equal(canonicalTopicKey('edibleParts'), 'uses');
  assert.equal(canonicalTopicKey('commonUses'), 'uses');
  assert.equal(canonicalTopicKey('habitat'), 'role');
  assert.equal(canonicalTopicKey('confusas'), 'safety');
  assert.equal(canonicalTopicKey('edible'), 'edible');

  for (const file of ['components/GroupGuideCard.js', 'screens/CareTopicsScreen.js']) {
    const source = read(file);
    assert.match(source, /canonicalTopicKey/);
    assert.doesNotMatch(source, /const TOPIC_ALIAS/);
  }
});

test('heavy locale loaders fail closed without fetching English', async () => {
  const originalFetch = global.fetch;
  try {
    const speciesUrls = [];
    global.fetch = async (url) => {
      speciesUrls.push(String(url));
      return { ok: false };
    };
    const species = loadExpoModule('components/speciesDetails.js', {
      './apiBase': { API_BASE: 'https://example.test' },
      './appLanguage': { normaliseAppLanguage: (value) => value || 'en' },
    });
    assert.equal(await species.getSpeciesDetails('pt'), null);
    assert.deepEqual(speciesUrls, ['https://example.test/locales/pt-species.json']);

    const groupUrls = [];
    global.fetch = async (url) => {
      groupUrls.push(String(url));
      return { ok: false };
    };
    const groups = loadExpoModule('components/groupContent.js', {
      '@react-native-async-storage/async-storage': {
        getItem: async () => null,
        setItem: async () => {},
      },
      './apiBase': { API_BASE: 'https://example.test' },
      './agronomySources': { getAgronomySources: () => [] },
      './appLanguage': { normaliseAppLanguage: (value) => value || 'en' },
    });
    assert.equal(await groups.getGroups('pt'), null);
    assert.deepEqual(groupUrls, ['https://example.test/locales/pt-groups.json']);

    const manualUrls = [];
    global.fetch = async (url) => {
      manualUrls.push(String(url));
      return { ok: false, status: 404 };
    };
    const manual = loadExpoModule('components/manualContent.js', {
      '@react-native-async-storage/async-storage': {
        getItem: async () => null,
        setItem: async () => {},
      },
      './apiBase': { API_BASE: 'https://example.test' },
      './topicKey': { canonicalTopicKey: (value) => value },
      './appLanguage': { normaliseAppLanguage: (value) => value || 'en' },
    });
    assert.equal(await manual.getManual('pt'), null);
    assert.deepEqual(manualUrls, ['https://example.test/locales/pt-manual.json']);

    const herbUrls = [];
    global.fetch = async (url) => {
      herbUrls.push(String(url));
      return { ok: false, status: 404 };
    };
    const herbs = loadExpoModule('components/herbDetails.js', {
      './apiBase': { API_BASE: 'https://example.test' },
      './appLanguage': { normaliseAppLanguage: (value) => value || 'en' },
    });
    assert.equal(await herbs.getHerbDetails('pt'), null);
    assert.deepEqual(herbUrls, ['https://example.test/locales/pt-herbs.json']);
    global.fetch = async (url) => {
      herbUrls.push(String(url));
      return { ok: true, json: async () => ({ basil: { overview: 'ok' } }) };
    };
    assert.deepEqual(
      await herbs.getHerbDetails('pt'),
      { basil: { overview: 'ok' } },
      'a transient locale failure must be retried on the next opening'
    );
    assert.deepEqual(herbUrls, [
      'https://example.test/locales/pt-herbs.json',
      'https://example.test/locales/pt-herbs.json',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('crop keeps vendor evidence and curated prose without inventing a calendar', () => {
  const api = read('api/identify.js');
  const cropStart = api.indexOf('\n  crop: {');
  const cropEnd = api.indexOf('\n  fish: {', cropStart);
  const cropApi = api.slice(cropStart, cropEnd);
  for (const field of ['overview:', 'commonNames:', 'alternatives:', 'similarImages:', 'disease:']) {
    assert.match(cropApi, new RegExp(field), `crop API must preserve ${field}`);
  }
  const screen = read('screens/CropDetailScreen.js');
  assert.match(screen, /getCuratedDetail\(i18n\.language, 'crop'/);
  assert.match(screen, /<IdentificationExtras entity=\{plant\}/);
  assert.doesNotMatch(screen, /<GroupGuideCard/,
    'crop group prose contains crop-specific protocols and must stay off an exact result');
  assert.match(screen, /groupKey: null/);
});

test('fish keeps evidence, ecology and the complete taxonomy without plant care', () => {
  const api = read('api/identify.js');
  const fishStart = api.indexOf('\n  fish: {');
  const fishEnd = api.indexOf('\n  sound: {', fishStart);
  const fishApi = api.slice(fishStart, fishEnd);
  for (const field of [
    'scientific:',
    'confidence:',
    'family:',
    'ord:',
    'commonNames:',
    'synonyms:',
    'alternatives:',
    'similarImages:',
  ]) {
    assert.match(fishApi, new RegExp(field), `fish API must preserve ${field}`);
  }

  const screen = read('screens/FishDetailScreen.js');
  assert.match(screen, /<TaxonomyTrail order=\{plant\.ord\} family=\{plant\.family\} scientific=\{plant\.scientific\}/,
    'fish must show the exact order, family and species as a taxonomy trail');
  assert.match(screen, /t\('detail\.synonyms'\)/,
    'fish receipt must preserve vendor synonyms');
  assert.ok(screen.indexOf('<IdentificationExtras') < screen.indexOf('<DistributionMap'),
    'fish evidence must lead over occurrence science');
  assert.ok(screen.indexOf('<ExactSpeciesGuide') < screen.indexOf('<DistributionMap'),
    'exact curated ecology must lead over occurrence science');
  assert.match(screen, /<GroupGuideCard[\s\S]{0,120}groupKey=\{guideGroupKey\}/,
    'fish group guidance must use the fail-closed guide key');
  assert.match(screen, /<TopicNavigatorCard topics=\{dossierLoading \? \[\] : topics\}/,
    'fish must expose its exact manual only after the asynchronous dossier settles');
  assert.match(screen, /loading=\{dossierLoading\}/,
    'fish must show loading instead of a misleading one-tab manual');

  const sync = read('api/collection.js');
  for (const field of ["'family'", "'ord'", "'commonNames'", "'synonyms'"]) {
    assert.match(sync, new RegExp(field), `fish field ${field} must survive cloud sync`);
  }

  const identify = read('screens/IdentifyScreen.js');
  assert.match(identify, /category !== 'fish' && category !== 'bird'/,
    'fish must not promise multiple angles that its provider ignores');
  assert.doesNotMatch(screen, /<SpeciesFaq|askSpecialistCta|navigate\('Botanist'/,
    'a botany specialist must not answer fish handling or venom questions');
});

test('taxonomy is never displayed as native origin', () => {
  const api = read('api/identify.js');
  assert.doesNotMatch(api, /\[fa\.genus, fa\.species\][\s\S]{0,100}origin/);
  assert.doesNotMatch(read('screens/FishDetailScreen.js'), /nativeOrigin/);
  assert.doesNotMatch(read('screens/InsectDetailScreen.js'), /nativeOrigin/);
  assert.doesNotMatch(read('screens/MushroomDetailScreen.js'), /nativeOrigin/);
});

test('insect safety appears before maps and can open from tags alone', () => {
  const insect = read('screens/InsectDetailScreen.js');
  assert.ok(insect.indexOf('title={t(\'detail.safetySection\')}') < insect.indexOf('<DistributionMap'));
  assert.match(insect, /const safetyFallback = hasDanger/);
  assert.match(insect, /hasSafetyEvidence && \{/);
  assert.match(insect, /const candidateDangerLabels = normaliseInsectTextList\(plant\.dangerLabel\)/);
  assert.match(insect, /'allergenic'/, 'allergenic warnings must be high risk');
  assert.match(insect, /'bites pets'/, 'pet-bite warnings must be high risk');
});

test('insect manual has fauna tabs instead of only two cards', () => {
  const insect = read('screens/InsectDetailScreen.js');
  const identify = read('screens/IdentifyScreen.js');
  const insectBuilder = read('components/insectDossierTopics.js');
  const topicNavigator = read('components/TopicNavigatorCard.js');
  const groupLoader = read('components/groupContent.js');
  const topicsBlock = insect.slice(insect.indexOf('const baseTopics = ['), insect.indexOf('const openTopic'));
  for (const key of ["key: 'overview'", "key: 'habitat'", "key: 'role'", "key: 'curiosity'", "key: 'details'"]) {
    assert.match(topicsBlock, new RegExp(key), `insect manual must include ${key}`);
  }
  for (const key of ['documentedFeeding', 'lifeStages', 'plantAssociations', 'ecologicalRelations']) {
    assert.match(insectBuilder, new RegExp(`${key}: Object\\.freeze`),
      `insect dossier builder must map ${key}`);
  }
  assert.match(insect, /buildInsectDossierTopics\(\{/,
    'the screen must use the tested exact-evidence builder');
  assert.match(insect, /getCuratedDetail\(i18n\.language, 'insect'/,
    'insect tabs must use the exact curated species catalog when available');
  assert.match(read('screens/CareTopicsScreen.js'), /details: \{ icon: 'finger-print'/,
    'the details tab must have intentional manual chrome');
  assert.doesNotMatch(topicsBlock, /watering|soil|fertilizer/i,
    'insect parity must not copy plant-care topics');
  const fixedTechnicalDepth = insect.indexOf('const resultDepth = RESULT_DEPTHS.EXPERT;');
  const manualDoor = insect.indexOf('<TopicNavigatorCard');
  const groupGuide = insect.indexOf('<GroupGuideCard', manualDoor);
  const expertLayer = insect.indexOf('depth={RESULT_DEPTHS.EXPERT}', groupGuide);
  assert.ok(fixedTechnicalDepth >= 0 && manualDoor >= 0 && groupGuide > manualDoor && expertLayer > groupGuide,
    'the permanent technical insect dossier must keep species and group manuals visible');
  assert.doesNotMatch(insect, /<ResultDepthSwitcher|useResultDepthPreference/,
    'an old visual preference must never hide insect dossier sections again');
  assert.match(insect, /loading=\{Boolean\(groupKey\) && groupGuide === undefined\}/,
    'the technical guide must announce its localized loading state instead of looking permanently short');
  assert.match(identify, /category !== 'insect'[\s\S]*getGroups\(i18n\.language\)/,
    'the localized insect guide should preload while the user prepares the photo');
  assert.match(groupLoader, /if \(pending\[code\]\) return pending\[code\];/,
    'preload and result screen must share one in-flight guide request');
  assert.match(topicNavigator, /topic\.orderStageProfile/,
    'order-level technical evidence must be an explicit navigator contract');
  assert.match(topicNavigator, /visible\.length === 0/,
    'one verified topic must remain reachable instead of hiding the whole manual');
});

test('every identification category exposes its truthful manual at fixed Expert depth', () => {
  const matrix = [
    ['screens/PlantDetailScreen.js', ['watering', 'light', 'soil', 'safety', 'uses', 'cultural', 'edible', 'propagation', 'overview']],
    ['screens/TreeDetailScreen.js', ['watering', 'light', 'soil', 'safety', 'uses', 'cultural', 'edible', 'propagation', 'overview']],
    ['screens/CropDetailScreen.js', ['overview', 'habitat', 'curiosity', 'uses', 'cultural', 'edibleParts', 'propagation']],
    ['screens/MushroomDetailScreen.js', ['safety', 'confusas', 'overview', 'habitat', 'curiosity', 'details']],
    ['screens/InsectDetailScreen.js', ['safety', 'overview', 'habitat', 'role', 'curiosity', 'details']],
    ['screens/FishDetailScreen.js', ['safety', 'overview', 'habitat', 'curiosity', 'details']],
    ['screens/BirdDetailScreen.js', ['overview', 'habitat', 'curiosity', 'details']],
    ['screens/SoundDetailScreen.js', ['evidence', 'overview', 'habitat', 'curiosity', 'details']],
  ];
  const conditionalTopicBuilders = read('components/mushroomSoundTopics.js');
  const insectTopicBuilder = read('components/insectDossierTopics.js');

  for (const [file, keys] of matrix) {
    const source = read(file);
    const usesConditionalBuilder = file.includes('Mushroom') || file.includes('Sound');
    const usesInsectBuilder = file.includes('Insect');
    const usesSpeciesTopics = file.includes('Fish') || file.includes('Bird');
    const topicStart = usesSpeciesTopics ? 'const speciesTopics = [' : 'const baseTopics = [';
    const start = usesConditionalBuilder ? -1 : source.indexOf(topicStart);
    const end = usesConditionalBuilder ? -1 : source.indexOf('const openTopic', start);
    if (!usesConditionalBuilder) {
      assert.ok(start >= 0 && end > start,
        `${file}: truthful topic definitions must feed the visible manual`);
    }
    const screenTopicDefinitions = usesConditionalBuilder ? '' : source.slice(start, end);
    const topicDefinitions = usesConditionalBuilder
      ? conditionalTopicBuilders
      : (usesInsectBuilder ? screenTopicDefinitions + insectTopicBuilder : screenTopicDefinitions);
    for (const key of keys) {
      const definition = usesConditionalBuilder ? `topic\\('${key}'` : `key: '${key}'`;
      assert.match(topicDefinitions, new RegExp(definition), `${file}: missing ${key}`);
    }
    const manualTopics = file.includes('Fish')
      ? /<TopicNavigatorCard\s+topics=\{dossierLoading \? \[\] : topics\}/
      : /<TopicNavigatorCard\s+topics=\{(?:topics|TOPICS)\}/;
    assert.match(source, manualTopics, `${file}: manual tabs need a visible entry point`);
    const manualDoor = source.indexOf('<TopicNavigatorCard');
    const expertLayer = source.indexOf('depth={RESULT_DEPTHS.EXPERT}', manualDoor);
    assert.match(source, /const resultDepth = RESULT_DEPTHS\.EXPERT;/,
      `${file}: every result must open with the complete Expert dossier`);
    assert.doesNotMatch(source, /<ResultDepthSwitcher|useResultDepthPreference/,
      `${file}: onboarding depth cannot hide verified dossier facts`);
    assert.ok(manualDoor >= 0 && expertLayer > manualDoor,
      `${file}: fixed Expert mode must keep both the manual and technical layer reachable`);
    assert.doesNotMatch(source, /value: t\('(?:detail\.openFullProtocol|common\.readMore)'\)/,
      `${file}: a navigation CTA is not a quick fact`);
  }

  const navigator = read('components/TopicNavigatorCard.js');
  for (const key of ['watering', 'light', 'soil', 'edible']) {
    assert.match(navigator, new RegExp(`${key}: \\{ icon:`), `${key}: needs intentional icon metadata`);
  }
});

test('opening a group guide preserves the exact species tabs', () => {
  const guide = read('components/GroupGuideCard.js');
  assert.match(guide, /const mergedTopics = \[\s*\.\.\.topics,/);
  assert.match(guide, /entryTopics\.filter/);
  assert.match(guide, /!topics\.some\(\(topic\) => topic\?\.key === candidate\.key\)/);
});

test('sound learning uses audio evidence language in every locale', () => {
  for (const file of uiLocaleFiles()) {
    const json = JSON.parse(read(path.join('public/locales', file)));
    assert.ok(json.categories.sound.scanHint, `${file}: categories.sound.scanHint`);
    assert.doesNotMatch(json.categories.sound.scanHint, /shape|formato|farbe|couleur/i,
      `${file}: sound guidance must not fall back to visual anatomy`);
  }
});
