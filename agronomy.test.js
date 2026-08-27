// Contrato da jornada de lavoura: triagem por foto, protocolo de campo e
// evidencia oficial sem transformar familia botanica em prescricao.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const { uiLocaleFiles } = require('./test-locales');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

function loadExpoModule(relativePath, stubs = {}) {
  const file = path.join(__dirname, relativePath);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const fakeRequire = (name) => (name in stubs ? stubs[name] : require(name));
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return mod.exports;
}

test('crop grouping uses documented taxon boundaries before family', () => {
  const { getSpeciesGroup, selfCheck } = loadExpoModule('components/speciesGroup.js');
  selfCheck();

  assert.equal(
    getSpeciesGroup({ category: 'crop', family: 'Poaceae', scientific: 'Saccharum officinarum' }),
    null,
    'sugarcane must not inherit cereal management'
  );
  assert.equal(
    getSpeciesGroup({ category: 'crop', family: 'Malvaceae', scientific: 'Gossypium hirsutum' }),
    null,
    'cotton must not inherit vegetable management'
  );
  assert.equal(
    getSpeciesGroup({ category: 'crop', family: 'Poaceae' }),
    null,
    'a family without the crop identity must not become a cereal protocol'
  );
  assert.equal(
    getSpeciesGroup({ category: 'crop', family: 'Malvaceae' }),
    null,
    'partial cotton data must fail closed too'
  );
  assert.equal(
    getSpeciesGroup({ category: 'crop', family: 'Rubiaceae', scientific: 'Coffea arabica' }),
    null,
    'coffee has no supported dossier yet'
  );
  assert.equal(
    getSpeciesGroup({ category: 'crop', family: 'Asteraceae', scientific: 'Helianthus annuus' }),
    'grainCrop'
  );
  assert.equal(
    getSpeciesGroup({ category: 'crop', family: 'Brassicaceae', scientific: 'Brassica napus' }),
    'grainCrop'
  );
  assert.equal(
    getSpeciesGroup({ category: 'crop', family: 'Brassicaceae', scientific: 'Brassica oleracea' }),
    'vegCrop'
  );
  assert.equal(getSpeciesGroup({ category: 'crop', scientific: 'Manihot esculenta' }), 'vegCrop');
  assert.equal(getSpeciesGroup({ category: 'crop', scientific: 'Citrus × sinensis' }), 'vegCrop');
  assert.equal(getSpeciesGroup({ category: 'crop', scientific: 'Unknown crop' }), null);

  const catalogCoverage = {
    'Zea mays': 'grainCrop',
    'Manihot esculenta': 'vegCrop',
    'Coffea arabica': null,
    'Glycine max': 'grainCrop',
    'Saccharum officinarum': null,
    'Triticum aestivum': 'grainCrop',
    'Oryza sativa': 'grainCrop',
    'Solanum tuberosum': 'vegCrop',
    'Musa acuminata': 'vegCrop',
    'Citrus x sinensis': 'vegCrop',
  };
  for (const [scientific, expected] of Object.entries(catalogCoverage)) {
    assert.equal(
      getSpeciesGroup({ category: 'crop', scientific }),
      expected,
      `catalog coverage: ${scientific}`
    );
  }
});

test('dangerous and ornamental plants never inherit edible family guidance', () => {
  const { getSpeciesGroup } = loadExpoModule('components/speciesGroup.js');
  const dangerousOrOrnamental = [
    ['Atropa belladonna', 'Solanaceae'],
    ['Datura stramonium', 'Solanaceae'],
    ['Brugmansia suaveolens', 'Solanaceae'],
    ['Conium maculatum', 'Apiaceae'],
    ['Cicuta maculata', 'Apiaceae'],
    ['Prunus serrulata', 'Rosaceae'],
  ];

  for (const [scientific, family] of dangerousOrOrnamental) {
    const resolved = getSpeciesGroup({ category: 'plant', scientific, family });
    assert.equal(resolved, null, `${scientific} must not resolve to an edible or herb guide`);
  }
});

test('known fruit plants enter orchard nutrition while ornamental relatives stay out', () => {
  const { getSpeciesGroup } = loadExpoModule('components/speciesGroup.js');
  const fruitTaxa = [
    ['Malus domestica', 'Rosaceae'],
    ['Pyrus communis', 'Rosaceae'],
    ['Prunus persica', 'Rosaceae'],
    ['Citrus sinensis', 'Rutaceae'],
    ['Mangifera indica', 'Anacardiaceae'],
    ['Persea americana', 'Lauraceae'],
    ['Psidium guajava', 'Myrtaceae'],
    ['Cocos nucifera', 'Arecaceae'],
  ];

  for (const category of ['plant', 'tree']) {
    for (const [scientific, family] of fruitTaxa) {
      assert.equal(
        getSpeciesGroup({ category, scientific, family }),
        'fruitVeg',
        `${category}: ${scientific} must receive fruit-production context`
      );
    }
  }

  assert.equal(
    getSpeciesGroup({ category: 'tree', scientific: 'Prunus serrulata', family: 'Rosaceae' }),
    null,
    'ornamental cherry must not inherit orchard nutrition'
  );
});

test('all locales carry botanical nutrition and one stable fertilizing schedule row', () => {
  const botanicalGroups = [
    'succulent',
    'tropicalFoliage',
    'fern',
    'fruitVeg',
    'flowering',
    'woody',
    'orchid',
    'herb',
  ];

  for (const file of uiLocaleFiles()) {
    const lang = file.replace('.json', '');
    const groups = JSON.parse(read(`public/locales/${lang}-groups.json`));
    const schedules = JSON.parse(read(`public/locales/${lang}-schedule.json`));
    for (const groupKey of botanicalGroups) {
      const topic = groups[groupKey]?.topics?.soil;
      assert.ok(topic?.advice?.length >= 2, `${lang}: shallow ${groupKey}.soil advice`);
      assert.ok(topic?.checklist?.length >= 4, `${lang}: shallow ${groupKey}.soil checklist`);
      const fertilizerRows = (schedules[groupKey]?.rows || [])
        .filter((row) => row?.activityKey === 'fertilizing');
      assert.equal(fertilizerRows.length, 1, `${lang}: ${groupKey} needs one fertilizing row`);
      assert.ok(fertilizerRows[0].activity?.trim(), `${lang}: ${groupKey} activity label missing`);
      assert.ok(
        ['spring', 'summer', 'autumn', 'winter'].some((season) => fertilizerRows[0][season]?.trim()),
        `${lang}: ${groupKey} fertilizing row has no season`
      );
    }
  }

  const loader = read('components/scheduleContent.js');
  assert.match(loader, /row\?\.activityKey === 'fertilizing'/);
  assert.doesNotMatch(loader, /return getSchedules\('en'\)/,
    'a missing schedule locale must hide instead of leaking English');
});

test('all locales carry the complete crop protocol without fake grain irrigation', () => {
  const localeNames = uiLocaleFiles().map((name) => name.replace('.json', ''));
  assert.equal(localeNames.length, 17);

  for (const lang of localeNames) {
    const groups = JSON.parse(read(`public/locales/${lang}-groups.json`));
    const expected = [
      ['grainCrop', 'soil'],
      ['grainCrop', 'uses'],
      ['vegCrop', 'watering'],
      ['vegCrop', 'soil'],
      ['vegCrop', 'uses'],
    ];
    for (const [groupKey, topicKey] of expected) {
      const topic = groups[groupKey]?.topics?.[topicKey];
      assert.ok(topic, `${lang}: missing ${groupKey}.${topicKey}`);
      assert.ok(topic.advice?.length >= 2, `${lang}: shallow advice in ${groupKey}.${topicKey}`);
      assert.ok(topic.checklist?.length >= 5, `${lang}: shallow checklist in ${groupKey}.${topicKey}`);
    }
    assert.equal(
      groups.grainCrop.topics.watering,
      undefined,
      `${lang}: grain irrigation must stay absent without a supported protocol`
    );
  }
});

test('crop result exposes exact numeric tables plus the generic fertilizer decision planner', () => {
  const card = read('components/GroupGuideCard.js');
  assert.match(card, /variant = 'guide'/);
  assert.match(card, /variant === 'agronomy'/);
  assert.match(card, /topic\?\.checklist[\s\S]+topic\?\.advice/);
  assert.match(card, /detail\.integratedManagementSection/);
  assert.match(card, /detail\.agronomyDecisionNote/);
  assert.match(card, /detail\.openFullProtocol/);
  assert.match(card, /if \(isAgronomy\)[\s\S]+groupOnly: true/);
  assert.doesNotMatch(card, /protocolPreview[^\n]+numberOfLines/);

  const crop = read('screens/CropDetailScreen.js');
  const report = crop.indexOf('<DiseaseReport');
  const pests = crop.indexOf('<PestManagementTablesCard');
  const fertilizer = crop.indexOf('<FertilizerTablesCard');
  const narrative = crop.indexOf('TOPICS.map');
  assert.ok(report >= 0 && report < pests, 'photo health result must lead exact field tables');
  assert.ok(pests < fertilizer, 'pest action belongs before nutrient planning');
  assert.ok(fertilizer < narrative, 'field action must appear before species narrative');
  assert.match(crop, /const showFertilizerPlanner = groupKey === 'grainCrop' \|\| groupKey === 'vegCrop'/);
  assert.match(crop, /const hasFieldContent = hasPestManagement \|\| showFertilizerPlanner \|\| TOPICS\.length > 0/);
  assert.match(crop, /\{hasFieldContent && \(\s*<ZoneBand gutter=\{20\}>/,
    'the crop field band must disappear when every fail-closed child is empty');
  assert.match(crop, /showPlannerFallback/,
    'generic fertilizer planning may show as education, but numeric tables remain exact');
  assert.doesNotMatch(crop, /<GroupGuideCard|variant="agronomy"/,
    'a rice/wheat/cotton result must never receive maize, soy or vegetable group numbers');
  assert.match(crop, /navigation\.navigate\('CareTopics', \{ groupKey: null/,
    'species prose must not reopen a cross-crop manual');
});

test('insect tables preserve sampling units, crop stages and action boundaries', () => {
  const {
    MAIZE_PEST_ROWS,
    PEST_MANAGEMENT_SOURCES,
    SOY_ACTION_ROWS,
    SOY_SAMPLE_ROWS,
    getPestManagementProfile,
    selfCheck,
  } = loadExpoModule('components/pestManagementTables.js');
  selfCheck();

  assert.deepEqual(MAIZE_PEST_ROWS, [
    { key: 'fallArmyworm', samplePoints: 5, sampleAreaHa: 1, actionPercent: 10 },
    { key: 'wireworm', sampleWidthCm: 30, sampleLengthCm: 30, sampleDepthCm: 15, actionCount: 2 },
  ]);
  assert.deepEqual(
    SOY_SAMPLE_ROWS.map((row) => [row.maxAreaHa, row.minimumPoints, row.splitAreaHa]),
    [[10, 6, undefined], [30, 8, undefined], [100, 10, undefined], [null, undefined, 100]]
  );
  assert.deepEqual(SOY_ACTION_ROWS.map((row) => row.key), [
    'defoliation', 'largeCaterpillars', 'grainStinkbugs', 'seedStinkbugs',
  ]);
  assert.equal(SOY_ACTION_ROWS[0].vegetativePercent, 30);
  assert.equal(SOY_ACTION_ROWS[0].reproductivePercent, 15);
  assert.equal(SOY_ACTION_ROWS[2].countPerMeter, 2);
  assert.equal(SOY_ACTION_ROWS[3].countPerMeter, 1);

  assert.equal(
    getPestManagementProfile({ scientific: 'Zea mays L.', groupKey: 'grainCrop' }).speciesTable,
    'maize'
  );
  assert.equal(
    getPestManagementProfile({ scientific: 'Glycine max (L.) Merr.', groupKey: 'grainCrop' }).speciesTable,
    'soy'
  );
  assert.equal(
    getPestManagementProfile({ scientific: 'Oryza sativa', groupKey: 'grainCrop' }),
    null,
    'soy and maize thresholds must not leak to rice'
  );
  assert.equal(getPestManagementProfile({ scientific: 'Zea mays', groupKey: null }), null);

  for (const source of Object.values(PEST_MANAGEMENT_SOURCES)) {
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(
      url.hostname === 'www.gov.br' || url.hostname === 'embrapa.br' || url.hostname.endsWith('.embrapa.br'),
      `unexpected pest source: ${url.hostname}`
    );
  }

  const card = read('components/PestManagementTablesCard.js');
  assert.match(card, /pestManagement\.noCountWarning/);
  assert.match(card, /profile\.speciesTable === 'maize'/);
  assert.match(card, /profile\.speciesTable === 'soy'/);
  assert.match(card, /PEST_MANAGEMENT_SOURCES\.agrofit/);
  assert.match(card, /accessibilityRole="link"/);
  assert.match(card, /function EntityScope[\s\S]+common\.identified/);
  assert.match(card, /name=\{entityName\}/);
  assert.doesNotMatch(card, /activeIngredient|commercialProduct|applicationDose|calendarSpray/i);
});

test('fertilizer tables keep extraction separate from a fertilizer recommendation', () => {
  const {
    FERTILIZER_SOURCES,
    MAIZE_EXTRACTION_ROWS,
    ONION_EXCESS_ROWS,
    getFertilizerProfile,
    selfCheck,
  } = loadExpoModule('components/fertilizerTables.js');
  selfCheck();

  assert.deepEqual(MAIZE_EXTRACTION_ROWS, [
    { destination: 'grain', productivity: 3.65, n: 77, p: 9, k: 83, ca: 10, mg: 10 },
    { destination: 'grain', productivity: 5.8, n: 100, p: 19, k: 95, ca: 7, mg: 17 },
    { destination: 'grain', productivity: 7.87, n: 167, p: 33, k: 113, ca: 27, mg: 25 },
    { destination: 'grain', productivity: 9.17, n: 187, p: 34, k: 143, ca: 30, mg: 28 },
    { destination: 'grain', productivity: 10.15, n: 217, p: 42, k: 157, ca: 32, mg: 33 },
    { destination: 'silage', productivity: 11.6, n: 115, p: 15, k: 69, ca: 35, mg: 26 },
    { destination: 'silage', productivity: 15.31, n: 181, p: 21, k: 213, ca: 41, mg: 28 },
    { destination: 'silage', productivity: 17.13, n: 230, p: 23, k: 271, ca: 52, mg: 31 },
    { destination: 'silage', productivity: 18.65, n: 231, p: 26, k: 259, ca: 58, mg: 32 },
  ]);
  assert.deepEqual(ONION_EXCESS_ROWS, [
    { nutrient: 'N', effectKey: 'nitrogenEffect' },
    { nutrient: 'K', effectKey: 'potassiumEffect' },
    { nutrient: 'P', effectKey: 'phosphorusEffect' },
  ]);

  assert.equal(
    getFertilizerProfile({ scientific: 'Zea mays L.', groupKey: 'grainCrop' }).speciesTable,
    'maize'
  );
  assert.equal(
    getFertilizerProfile({ scientific: 'Allium cepa', groupKey: 'vegCrop' }).speciesTable,
    'onion'
  );
  assert.equal(
    getFertilizerProfile({ scientific: 'Triticum aestivum', groupKey: 'grainCrop' }),
    null,
    'maize extraction must not leak to wheat'
  );
  assert.equal(
    getFertilizerProfile({ scientific: 'Oryza sativa', groupKey: 'grainCrop' }),
    null,
    'maize extraction must not leak to rice'
  );
  assert.equal(
    getFertilizerProfile({ scientific: 'Allium sativum', groupKey: 'vegCrop' }),
    null,
    'onion interactions must not leak to garlic'
  );
  assert.equal(
    getFertilizerProfile({ scientific: null, groupKey: 'grainCrop' }),
    null,
    'missing identity must hide every numeric table'
  );
  assert.equal(
    getFertilizerProfile({ scientific: 'Solanum tuberosum', groupKey: null }),
    null,
    'unsupported classification must hide the complete block'
  );

  for (const source of Object.values(FERTILIZER_SOURCES)) {
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(url.hostname === 'embrapa.br' || url.hostname.endsWith('.embrapa.br'));
  }

  const card = read('components/FertilizerTablesCard.js');
  assert.doesNotMatch(card, /<ScrollView[\s\S]+horizontal/);
  assert.match(card, /function NutrientLegend/);
  assert.match(card, /function MaizeExtractionCard/);
  assert.match(card, /function MaizeDestinationSection/);
  assert.match(card, /MAIZE_DESTINATIONS\.map/);
  assert.match(card, /MAIZE_EXTRACTION_ROWS\.filter\(\(row\) => row\.destination === destination\.key\)/);
  assert.match(card, /NUTRIENT_META\.map/);
  assert.match(card, /nutrientGrid: \{ flexDirection: 'row', flexWrap: 'wrap' \}/);
  assert.match(card, /nutrientTileSecondary: \{ width: '50%'/);
  assert.match(card, /MAIZE_EXTRACTION_ROWS\.every\(hasCompleteExtractionRow\)/);
  assert.match(card, /ONION_EXCESS_ROWS\.every\(hasCompleteOnionRow\)/);
  assert.match(card, /fertilizer\.notDoseWarning/);
  assert.match(card, /if \(!profile && !showPlannerFallback\) return null/);
  assert.match(card, /\(!profile \|\| profile\.speciesTable === 'maize'\)/);
  assert.match(card, /profile\?\.speciesTable === 'maize'/);
  assert.match(card, /profile\?\.speciesTable === 'onion'/);
  assert.match(card, /accessibilityRole="link"/);
  assert.match(card, /function EntityScope[\s\S]+common\.identified/);
  assert.match(card, /name=\{entityName\}/);
  assert.doesNotMatch(card, /P2O5|K2O|recommend(?:ed|ation)?Dose|fertilizerDose/i);
});

test('catalog crops open the agronomy screen without claiming a photo diagnosis', () => {
  const topic = read('screens/TopicDetailScreen.js');
  assert.match(topic, /topicKey === 'fromFieldToPlate'/);
  assert.match(topic, /navigation\.navigate\('CropDetail'/);
  assert.match(topic, /healthAssessed: false/);
  assert.match(topic, /discover\.viewSpeciesLabel/);

  const app = read('App.js');
  const discoverStart = app.indexOf('function DiscoverStackNav');
  const discoverEnd = app.indexOf('const TAB_ICONS', discoverStart);
  const discoverStack = app.slice(discoverStart, discoverEnd);
  assert.match(discoverStack, /name="CropDetail" component=\{CropDetailScreen\}/);
  assert.match(discoverStack, /name="CareTopics" component=\{CareTopicsScreen\}/);

  const api = read('api/identify.js');
  assert.match(api, /healthAssessed: true/);
  assert.match(read('components/collectionSyncSchema.js'), /'healthAssessed'/);
  const crop = read('screens/CropDetailScreen.js');
  assert.match(crop, /plant\.healthAssessed === true/,
    'resultado sem avaliacao explicita nao pode virar laudo de planta saudavel');
  assert.match(crop, /showIdentifiedBadge=\{hasHealthAssessment\}/);
  assert.match(read('components/PlantHero.js'), /showIdentifiedBadge && badge/);
});

test('field protocols expose only verified official agronomy sources', () => {
  const { getAgronomySources } = loadExpoModule('components/agronomySources.js');
  for (const [groupKey, topicKey] of [
    ['grainCrop', 'soil'],
    ['grainCrop', 'uses'],
    ['vegCrop', 'watering'],
    ['vegCrop', 'soil'],
    ['vegCrop', 'uses'],
  ]) {
    const sources = getAgronomySources(groupKey, topicKey);
    assert.ok(sources.length > 0, `${groupKey}.${topicKey} needs evidence`);
    for (const source of sources) {
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:');
      assert.ok(url.hostname === 'embrapa.br' || url.hostname.endsWith('.embrapa.br'));
    }
  }
  assert.deepEqual(getAgronomySources('grainCrop', 'watering'), []);
  assert.deepEqual(getAgronomySources('gardenBird', 'uses'), []);

  const topics = read('screens/CareTopicsScreen.js');
  assert.match(topics, /groupManual\.sources/);
  assert.match(topics, /accessibilityRole="link"/);
  assert.match(topics, /detail\.speciesCareSource/);
});

test('crop treatment keeps uncertainty and chemical registration visible', () => {
  const report = read('components/DiseaseReport.js');
  assert.match(report, /Number\.isFinite\(disease\.confidence\)/);
  assert.match(report, /disease\.diagnosisCaution/);
  assert.match(report, /disease\.treatment\.chemical\?\.length > 0/);
  assert.match(report, /disease\.chemicalCaution/);
  assert.match(report, /disease\.commonNames/);
  assert.match(report, /disease\.eppoCode/);
  assert.match(report, /disease\.gbifId/);
  assert.match(report, /disease\.similarImages/);
  assert.match(report, /disease\.overviewCitation/);

  for (const file of uiLocaleFiles()) {
    const locale = JSON.parse(read(path.join('public/locales', file)));
    for (const key of [
      'agronomySection',
      'agronomyDecisionNote',
      'integratedManagementSection',
      'openFullProtocol',
      'healthSpeciesMismatch',
    ]) {
      assert.ok(locale.detail[key], `${file}: missing detail.${key}`);
    }
    assert.ok(locale.disease.diagnosisCaution, `${file}: missing disease.diagnosisCaution`);
    assert.ok(locale.disease.chemicalCaution, `${file}: missing disease.chemicalCaution`);
  }
});

test('plant and tree health scans are accepted only when both models identify the same species', () => {
  for (const screen of ['PlantDetailScreen.js', 'TreeDetailScreen.js']) {
    const source = read(`screens/${screen}`);
    assert.match(source, /const enrichment = enrichmentTaxon\(plant\.identityV1, \{[\s\S]*?scientificName: plant\.scientific/,
      `${screen}: the expected species must cross the exact-identity boundary`);
    assert.match(source, /const enrichmentScientific = enrichment\?\.canonicalName \|\| null/, screen);
    assert.match(source, /canonicalBinomial\(enrichmentScientific\)/, screen);
    assert.doesNotMatch(source, /canonicalBinomial\(plant\.scientific\)/,
      `${screen}: a raw provider label must not authorise a health report`);
    assert.match(source, /canonicalBinomial\(cropEntity\?\.scientific\)/, screen);
    assert.match(
      source,
      /!expectedSpecies \|\| !checkedSpecies \|\| expectedSpecies !== checkedSpecies[\s\S]+setHealthResult\(null\)[\s\S]+healthSpeciesMismatch[\s\S]+return;/,
      `${screen}: missing or cross-species identity must stop before the disease result is mounted`
    );
    assert.match(source, /const acceptedResult = \{[\s\S]*healthAssessed: true,[\s\S]*disease: cropEntity\.disease \?\? null/, screen);
    assert.match(source, /setHealthResult\(acceptedResult\)/, screen);
    assert.match(source, /updateCollectionEntry\(savedEntryId, healthFields\(acceptedResult\)\)/, screen);
    assert.match(source, /saveToCollection\(\{ \.\.\.plant, \.\.\.healthFields\(healthResult\) \}\)/, screen);
    assert.match(source, /useState\(\(\) => healthResultFromEntry\(plant\)\)/, screen);
    assert.match(source, /setHealthResult\(healthResultFromEntry\(found\)\)/, screen);
    assert.match(source, /photoBase64 && !healthResult/, `${screen}: the health action needs a fresh photo`);
    assert.match(source, /<DiseaseReport disease=\{healthResult\.disease\}/, screen);
    assert.match(source, /<PaywallModal/, screen);

    const mismatchStart = source.indexOf(
      'if (!expectedSpecies || !checkedSpecies || expectedSpecies !== checkedSpecies)'
    );
    const acceptedStart = source.indexOf('const acceptedResult =', mismatchStart);
    assert.ok(mismatchStart >= 0 && acceptedStart > mismatchStart, screen);
    assert.doesNotMatch(source.slice(mismatchStart, acceptedStart), /updateCollectionEntry/, screen);
  }

  const identityBoundary = read('components/taxonIdentity.js');
  assert.match(identityBoundary, /identity\.status !== 'exact'[\s\S]*?return null/,
    'candidate or unresolved identities must fail closed');
  assert.match(identityBoundary, /if \(identity !== undefined\) return exactTaxon\(identity\)/,
    'new records must not fall back to an unverified legacy scientific name');

  const tree = read('screens/TreeDetailScreen.js');
  assert.match(tree, /photoBase64 \|\| healthResult \|\| healthError/,
    'a saved tree report must remain visible after its transient photo is gone');
  assert.match(tree, /import PlantFertilizerCard from/,
    'trees need the same contextual nutrition experience as plants');
  assert.match(tree, /<PlantFertilizerCard[\s\S]*category="tree"/,
    'the tree screen must identify its botanical context');
  assert.doesNotMatch(tree, /FertilizerTablesCard|showPlannerFallback/,
    'a tree must not inherit field-production tables');

  const plant = read('screens/PlantDetailScreen.js');
  assert.match(plant, /import PlantFertilizerCard from/);
  assert.match(plant, /<PlantFertilizerCard[\s\S]*category="plant"/);
  assert.doesNotMatch(plant, /FertilizerTablesCard|showPlannerFallback/,
    'houseplants must not receive field-production vocabulary');

  const botanicalCard = read('components/PlantFertilizerCard.js');
  assert.match(botanicalCard, /BOTANICAL_CATEGORIES = new Set\(\['plant', 'tree'\]\)/);
  assert.match(botanicalCard, /getGroupTopic\(botanicalGroup, 'soil', i18n\.language\)/);
  assert.match(botanicalCard, /getGroupFertilizerSchedule\(botanicalGroup, i18n\.language\)/);
  assert.doesNotMatch(botanicalCard, /MAIZE_EXTRACTION_ROWS|ONION_EXCESS_ROWS|getFertilizerProfile/,
    'exact crop tables must stay out of the botanical guide');

  const crop = read('screens/CropDetailScreen.js');
  assert.match(crop, /import FertilizerTablesCard from/);
  assert.doesNotMatch(crop, /PlantFertilizerCard/,
    'crop keeps the agronomic mode of the same nutrition experience');

  const { canonicalBinomial } = loadExpoModule('components/curatedDetails.js', {
    './speciesDetails': { getSpeciesDetail: async () => null },
  });
  assert.equal(canonicalBinomial('Zea mays L.'), 'zea mays');
  assert.equal(canonicalBinomial('Zea   mays'), 'zea mays');
  assert.equal(canonicalBinomial('Gossypium hirsutum L.'), 'gossypium hirsutum');
  assert.notEqual(canonicalBinomial('Zea mays'), canonicalBinomial('Gossypium hirsutum'));
  assert.equal(canonicalBinomial(null), '');
});

test('botanical nutrition stays visible and expanded in the fixed Expert dossier', () => {
  for (const screen of ['PlantDetailScreen.js', 'TreeDetailScreen.js']) {
    const source = read(`screens/${screen}`);
    const fertilizer = source.indexOf('<PlantFertilizerCard');
    const expertLayer = source.indexOf(
      '<ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.EXPERT}>'
    );

    assert.match(source, /const resultDepth = RESULT_DEPTHS\.EXPERT;/,
      `${screen}: the complete truthful dossier must be the fixed default`);
    assert.doesNotMatch(source, /<ResultDepthSwitcher|useResultDepthPreference|setResultDepth/,
      `${screen}: an old preference must not hide botanical evidence`);
    assert.ok(
      fertilizer >= 0 && expertLayer >= 0 && fertilizer < expertLayer,
      `${screen}: the nutrition entry point must remain before the detailed evidence band`
    );
    assert.equal(
      source.match(/<PlantFertilizerCard/g)?.length,
      1,
      `${screen}: the nutrition card must mount once`
    );
    assert.match(
      source,
      /defaultExpanded=\{resultDepth === RESULT_DEPTHS\.EXPERT\}/,
      `${screen}: fixed Expert mode must reveal the complete nutrition plan`
    );
  }

  const card = read('components/PlantFertilizerCard.js');
  assert.match(card, /defaultExpanded = false/);
  assert.match(card, /const \[expandedOverride, setExpandedOverride\] = useState\(undefined\)/);
  assert.match(card, /expandedOverride \?\? defaultExpanded/);
  assert.match(card, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(card, /common\.readMore/);
  assert.match(card, /common\.readLess/);
});

test('botanical nutrition fails closed without blaming a transient content outage', () => {
  const card = read('components/PlantFertilizerCard.js');

  assert.match(
    card,
    /!botanicalGroup\s*\?\s*\(/,
    'the no-guide message belongs only to an unrecognised botanical group'
  );
  assert.doesNotMatch(
    card,
    /topic\s*===\s*null\s*\?\s*\(/,
    'a network/cache miss must omit the group layer instead of claiming no guide exists'
  );
});

test('the dedicated nutrition card owns fertilizer facts without duplicates in Expert mode', () => {
  const schedule = read('components/CareSchedule.js');
  const speciesCare = read('components/SpeciesCareCard.js');

  assert.match(schedule, /hideFertilizing\s*=\s*false/);
  assert.match(schedule, /row\?\.activityKey\s*!==\s*'fertilizing'/);
  assert.match(speciesCare, /hideFertility\s*=\s*false/);
  assert.match(speciesCare, /r\.key\s*!==\s*'fertility'/);

  for (const screen of ['PlantDetailScreen.js', 'TreeDetailScreen.js']) {
    const source = read(`screens/${screen}`);
    assert.match(source, /<CareSchedule[\s\S]*?hideFertilizing/);
    assert.match(source, /<SpeciesCareCard[\s\S]*?hideFertility/);
  }
});

test('crop agronomy doors and evidence-gated tables stay visible in the fixed Expert dossier', () => {
  const crop = read('screens/CropDetailScreen.js');
  const hub = crop.indexOf('{hasAgronomyModules && (');
  const expert = crop.indexOf(
    '<ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.EXPERT}>'
  );
  const tables = crop.indexOf('<FertilizerTablesCard');

  assert.match(crop, /const resultDepth = RESULT_DEPTHS\.EXPERT;/,
    'crop must mount the complete truthful dossier by default');
  assert.doesNotMatch(crop, /<ResultDepthSwitcher|useResultDepthPreference|setResultDepth/,
    'an old depth preference must not hide field evidence');
  assert.ok(hub >= 0 && hub < expert,
    'the agronomy hub must remain a visible door before the detailed evidence band');
  assert.ok(tables > expert, 'field tables must remain in the detailed evidence band');
  assert.match(
    crop,
    /const hasPestManagement = !!getPestManagementProfile\(\{ scientific: enrichmentScientific, groupKey \}\)/,
    'MIP must remain gated by the confirmed scientific identity and audited crop profile'
  );
  assert.match(crop, /<FertilizerTablesCard[\s\S]*?scientific=\{enrichmentScientific\}/,
    'numeric fertilizer tables must receive only the confirmed enrichment identity');
});

test('all locales explain every fertilizer table without an English fallback', () => {
  const keys = [
    'title',
    'planningNote',
    'input',
    'decisionUse',
    'soilAnalysis',
    'soilAnalysisUse',
    'plantAnalysis',
    'plantAnalysisUse',
    'targetDestination',
    'targetDestinationUse',
    'fieldHistory',
    'fieldHistoryUse',
    'textureWater',
    'textureWaterUse',
    'diagnosisCaution',
    'maizeTitle',
    'maizeIntro',
    'destination',
    'productivity',
    'grain',
    'silage',
    'tonnesPerHectare',
    'kgPerHectare',
    'extractedUnit',
    'notDoseWarning',
    'onionTitle',
    'onionIntro',
    'excess',
    'possibleEffect',
    'nitrogenEffect',
    'potassiumEffect',
    'phosphorusEffect',
    'scrollHint',
    'botanicalTitle',
    'botanicalIntro',
    'unknownGroupNote',
    'growthStress',
    'growthStressUse',
    'labelHistory',
    'labelHistoryUse',
    'plantNoDoseWarning',
  ];

  for (const file of uiLocaleFiles()) {
    const locale = JSON.parse(read(path.join('public/locales', file)));
    for (const key of keys) {
      assert.ok(
        typeof locale.fertilizer?.[key] === 'string' && locale.fertilizer[key].trim(),
        `${file}: missing fertilizer.${key}`
      );
    }
  }
});

test('all locales explain insect monitoring and action tables', () => {
  const keys = [
    'title',
    'decisionNote',
    'whatToCheck',
    'fieldDecision',
    'identifyDamage',
    'identifyDamageUse',
    'samplingPlan',
    'samplingPlanUse',
    'countStage',
    'countStageUse',
    'noCountWarning',
    'chemicalSafetyTitle',
    'maizeTitle',
    'target',
    'fieldProtocol',
    'fallArmyworm',
    'fallArmywormProtocol',
    'wireworm',
    'wirewormProtocol',
    'maizeThresholdNote',
    'soyTitle',
    'soySamplingTitle',
    'fieldArea',
    'minimumSamples',
    'upToHectares',
    'overHectares',
    'samplePoints',
    'dividePlots',
    'soyThresholdTitle',
    'situation',
    'actionLevel',
    'defoliation',
    'defoliationLevel',
    'largeCaterpillars',
    'largeCaterpillarsLevel',
    'grainStinkbugs',
    'grainStinkbugsLevel',
    'seedStinkbugs',
    'seedStinkbugsLevel',
    'soyThresholdNote',
  ];

  for (const file of uiLocaleFiles()) {
    const locale = JSON.parse(read(path.join('public/locales', file)));
    for (const key of keys) {
      assert.ok(
        typeof locale.pestManagement?.[key] === 'string' && locale.pestManagement[key].trim(),
        `${file}: missing pestManagement.${key}`
      );
    }
  }
});
