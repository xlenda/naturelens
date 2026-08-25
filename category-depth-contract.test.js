const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const {
  CATEGORY_DEPTH_MATRIX,
  CATEGORY_FIELDS,
  MISSING_DATA_BEHAVIOUR,
  auditCategoryEvidence,
  buildCategoryDepthTopics,
  hasConcreteEvidence,
} = require('./components/categoryDepthContract');
const { normaliseSpeciesDossier } = require('./components/speciesDossier');
const { normaliseBirdDossier } = require('./components/birdSpeciesDossier');
const {
  buildMushroomTopics,
  buildSoundTopics,
} = require('./components/mushroomSoundTopics');

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));

const SOURCE = Object.freeze({
  worms: { id: 'worms', url: 'https://www.marinespecies.org/aphia.php?p=taxdetails&id=159364', license: 'CC-BY-4.0' },
  gbif: { id: 'gbif', url: 'https://www.gbif.org/species/9510564', license: 'CC-BY-4.0' },
  wikidata: { id: 'wikidata', url: 'https://www.wikidata.org/wiki/Q460967', license: 'CC0-1.0' },
  wikipedia: {
    id: 'wikipedia',
    url: 'https://pt.wikipedia.org/wiki/Species_exemplaris',
    license: 'CC-BY-SA-4.0',
  },
});

function globi(scientific) {
  return {
    id: 'globi',
    url: `https://globalbioticinteractions.org/?sourceTaxon=${encodeURIComponent(scientific)}`,
    license: 'CC-BY-4.0',
  };
}

function topicKeys(topics) {
  return topics.map((topic) => topic.key);
}

function loadExpoModule(relativePath) {
  const file = path.join(__dirname, relativePath);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}

test('the executable matrix names all eight editorial models without claiming total coverage', () => {
  assert.deepEqual(Object.keys(CATEGORY_DEPTH_MATRIX), [
    'plant', 'tree', 'crop', 'mushroom', 'insect', 'fish', 'bird', 'sound',
  ]);

  for (const [category, contract] of Object.entries(CATEGORY_DEPTH_MATRIX)) {
    assert.ok(contract.sections.length >= 8, `${category}: semantic sections must be explicit`);
    assert.equal(new Set(contract.sections).size, contract.sections.length, `${category}: duplicate section`);
    assert.equal(contract.missingData, MISSING_DATA_BEHAVIOUR);
    assert.equal(contract.coverage.status, 'partial');
    assert.equal(contract.coverage.exhaustive, false);
    assert.ok(contract.coverage.limitations.length > 0, `${category}: limitations must be recorded`);
    assert.ok(contract.sources.length > 0, `${category}: current sources must be recorded`);
    for (const source of contract.sources) {
      assert.equal(source.exhaustive, false, `${category}/${source.id}: no source is total coverage`);
      assert.ok(source.sections.every((section) => contract.sections.includes(section)),
        `${category}/${source.id}: source scope must be semantically valid`);
      if (source.mode.startsWith('bounded-')) {
        assert.ok(Number.isInteger(source.catalogueSize) && source.catalogueSize > 0,
          `${category}/${source.id}: bounded coverage must publish its limit`);
      }
    }
  }
});

for (const [category, contract] of Object.entries(CATEGORY_DEPTH_MATRIX)) {
  test(`${category}: placeholders and static topic chrome are never dossier evidence`, () => {
    const exactSource = contract.sources.find((source) => source.countsTowardExactDossier);
    const section = exactSource.sections[0];
    for (const value of [
      'No data',
      `detail.${section}`,
      section,
      { key: section, label: section, icon: 'leaf' },
      [],
      {},
    ]) {
      assert.equal(hasConcreteEvidence(value, section), false, `${category}: ${JSON.stringify(value)}`);
      assert.deepEqual(auditCategoryEvidence({
        category,
        sections: { [section]: { value, sourceIds: [exactSource.id] } },
      }), []);
    }
    assert.deepEqual(auditCategoryEvidence({
      category,
      sections: { [section]: { value: { observed: true }, sourceIds: ['made-up-source'] } },
    }), [], `${category}: an undeclared source must not count`);
  });
}

test('bounded sizes in the matrix stay tied to the real local datasets', () => {
  const speciesCare = readJson('public/locales/species-care.json');
  assert.equal(CATEGORY_DEPTH_MATRIX.plant.sources.find((item) => item.id === 'usda-plants').catalogueSize,
    speciesCare._count);
  assert.equal(CATEGORY_DEPTH_MATRIX.tree.sources.find((item) => item.id === 'usda-plants').catalogueSize,
    speciesCare._count);

  const cropRegistry = loadExpoModule('components/cropAgronomyRegistry.js');
  assert.equal(cropRegistry.selfCheck(), true);
  assert.equal(CATEGORY_DEPTH_MATRIX.crop.sources.find((item) => item.id === 'crop-agronomy-registry').catalogueSize,
    cropRegistry.CROP_AGRONOMY_REGISTRY.length);

  const discover = readJson('public/locales/en.json').discover.topics;
  const cataloguePairs = [
    ['mushroom', 'curated-mushroom', 'fungiOfTheWorld'],
    ['insect', 'curated-insect', 'gardenInsects'],
    ['fish', 'curated-fish', 'oceanAndRiverFish'],
    ['bird', 'curated-bird', 'birdsOfTheWorld'],
    ['sound', 'curated-sound', 'heardNotSeen'],
  ];
  for (const [category, sourceId, topicKey] of cataloguePairs) {
    const declared = CATEGORY_DEPTH_MATRIX[category].sources.find((item) => item.id === sourceId);
    assert.equal(declared.catalogueSize, discover[topicKey].species.length,
      `${category}: catalogue limit must follow the published list`);
  }

  const ipmSource = fs.readFileSync(path.join(__dirname, 'components/ipmDossier.js'), 'utf8');
  const pairsBlock = ipmSource.slice(ipmSource.indexOf('const PAIR_CONTRACTS'), ipmSource.indexOf('function cleanScientific'));
  const pairCount = (pairsBlock.match(/'[^'\r\n]+\|[^'\r\n]+': Object\.freeze\(/g) || []).length;
  assert.equal(CATEGORY_DEPTH_MATRIX.insect.sources.find((item) => item.id === 'ipm-dossier').catalogueSize,
    pairCount);

  const curatedSource = fs.readFileSync(path.join(__dirname, 'components/curatedDetails.js'), 'utf8');
  const safetyBlock = curatedSource.slice(curatedSource.indexOf('const SAFETY_LEVELS'), curatedSource.indexOf('export const canonicalBinomial'));
  const safetyCount = (safetyBlock.match(/^\s{2}[a-z_]+:\s*'(?:danger|warning)'/gm) || []).length;
  assert.equal(CATEGORY_DEPTH_MATRIX.fish.sources.find((item) => item.id === 'fish-safety').catalogueSize,
    safetyCount, 'fish safety must stay explicitly bounded instead of treating unknown as safe');
});

test('all eight categories declare the optional exact local-article layer', () => {
  for (const [category, contract] of Object.entries(CATEGORY_DEPTH_MATRIX)) {
    const wikipedia = contract.sources.find((item) => item.id === 'wikipedia');
    assert.ok(wikipedia, `${category}: Wikipedia source contract`);
    assert.equal(wikipedia.mode, 'dynamic-local-article');
    assert.equal(wikipedia.countsTowardExactDossier, true);
    assert.ok(wikipedia.sections.length > 0, `${category}: documented article scope`);
  }
});

test('real plant, tree and crop fixtures count only the exact sections they actually contain', () => {
  const speciesCare = readJson('public/locales/species-care.json');
  const herb = speciesCare['achillea millefolium'];
  const tree = speciesCare['acer rubrum'];
  assert.ok(herb?.moisture && tree?.phMin && tree?.phMax);

  assert.deepEqual(topicKeys(auditCategoryEvidence({
    category: 'plant',
    sections: {
      water: { value: { moisture: herb.moisture, drought: herb.drought }, sourceIds: ['usda-plants'] },
      propagation: { value: 'detail.propagation', sourceIds: ['plant-group-manual'] },
    },
  })), ['water']);
  assert.deepEqual(topicKeys(auditCategoryEvidence({
    category: 'tree',
    sections: {
      soil: { value: { phMin: tree.phMin, phMax: tree.phMax }, sourceIds: ['usda-plants'] },
      fruiting: { value: 'No data', sourceIds: ['tree-group-manual'] },
    },
  })), ['soil']);

  const registry = loadExpoModule('components/cropAgronomyRegistry.js');
  const maize = registry.getCropAgronomyProfile('Zea mays');
  const sunflower = registry.getCropAgronomyProfile('Helianthus annuus');
  assert.ok(maize.modules.current.includes('fertilizerExtraction'));
  assert.deepEqual(sunflower.modules.current, [], 'a registered crop can still have no current agronomy module');
  assert.deepEqual(topicKeys(auditCategoryEvidence({
    category: 'crop',
    sections: {
      nutritionFertilization: {
        value: maize.modules.current.filter((item) => item === 'fertilizerExtraction'),
        sourceIds: ['crop-agronomy-registry'],
      },
      ipm: { value: sunflower.modules.current, sourceIds: ['crop-agronomy-registry'] },
    },
  })), ['nutritionFertilization']);
});

test('real bounded mushroom and sound prose is evidence for those entries, never worldwide coverage', () => {
  const details = readJson('public/locales/en-species.json');
  const mushroom = details.fungiDetails.flyAgaric;
  const sound = details.soundDetails.tawnyOwl;
  const mushroomTopics = buildMushroomTopics({
    labels: { overview: 'Overview', habitat: 'Habitat', curiosity: 'Ecological role' },
    overview: mushroom.overview,
    habitat: mushroom.habitat,
    curiosity: mushroom.curiosity,
  });
  const soundTopics = buildSoundTopics({
    labels: { overview: 'Overview', habitat: 'Habitat', curiosity: 'Behavior' },
    overview: sound.overview,
    habitat: sound.habitat,
    curiosity: sound.curiosity,
  });

  assert.deepEqual(topicKeys(auditCategoryEvidence({
    category: 'mushroom',
    sections: {
      habitat: { value: mushroomTopics.find((item) => item.key === 'habitat')?.text, sourceIds: ['curated-mushroom'] },
      lifeCycle: { value: 'detail.lifeCycle', sourceIds: ['curated-mushroom'] },
    },
  })), ['habitat']);
  assert.deepEqual(topicKeys(auditCategoryEvidence({
    category: 'sound',
    sections: {
      habitatContext: { value: soundTopics.find((item) => item.key === 'habitat')?.text, sourceIds: ['curated-sound'] },
      acousticPattern: { value: 'No data', sourceIds: ['curated-sound'] },
    },
  })), ['habitatContext']);
  assert.equal(CATEGORY_DEPTH_MATRIX.mushroom.coverage.exhaustive, false);
  assert.equal(CATEGORY_DEPTH_MATRIX.sound.coverage.exhaustive, false);
});

test('the depth matrix cannot turn static topic keys into rendered content', () => {
  for (const [category, fields] of Object.entries(CATEGORY_FIELDS)) {
    assert.ok(fields.length >= 5, `${category}: the editorial model must be explicit`);
    assert.deepEqual(buildCategoryDepthTopics({
      category,
      scientific: 'Species exemplaris',
      dossier: {
        scientific: 'Species exemplaris',
        sources: Object.values(SOURCE),
      },
    }), [], `${category}: field names alone are not evidence`);
  }

  assert.deepEqual(buildCategoryDepthTopics({
    category: 'bird',
    scientific: 'Turdus migratorius',
    dossier: {
      scientific: 'Turdus migratorius',
      diet: 'No data',
      habitat: [],
      sources: [SOURCE.gbif, SOURCE.wikidata],
    },
  }), [], 'placeholders and empty arrays must render no topic');
});

test('an exact insect outside the local catalogue produces only source-bound dynamic topics', () => {
  const scientific = 'Danaus plexippus';
  const source = globi(scientific);
  const dossier = normaliseSpeciesDossier({
    scientific,
    diet: [],
    habitat: [],
    reproduction: [],
    lifeCycle: [],
    conservation: null,
    feeding: [{ id: 'eats:GBIF:3170240', name: 'Asclepias curassavica', relation: 'eats' }],
    plantAssociations: [{ id: 'eats:GBIF:3170240', name: 'Asclepias curassavica', relation: 'eats' }],
    ecologicalRelations: [],
    documentedLifeStages: ['larva', 'adult'],
    sources: [
      { id: 'gbif', url: 'https://www.gbif.org/species/5136071', license: 'CC-BY-4.0' },
      source,
    ],
  }, scientific);

  const topics = buildCategoryDepthTopics({ category: 'insect', scientific, dossier });
  assert.deepEqual(topicKeys(topics), ['documentedFeeding', 'plantAssociations', 'lifeStages']);
  for (const topic of topics) {
    assert.equal(topic.scientific, scientific);
    assert.ok(topic.evidence.length > 0);
    assert.ok(topic.sourceIds.includes('globi'));
    assert.ok(topic.sourceIds.includes('gbif'));
  }
});

test('an exact bird outside the local catalogue produces evidenced topics, not an empty manual', () => {
  const scientific = 'Turdus migratorius';
  const dossier = normaliseBirdDossier({
    scientific,
    diet: [{ id: 'Q25349', label: 'insetos' }],
    habitat: [{ id: 'Q179049', label: 'floresta' }],
    reproduction: [{ id: 'clutchSize', amount: 3, unit: 'count' }],
    lifeCycle: [],
    conservation: null,
    sources: [SOURCE.gbif, SOURCE.wikidata],
  }, scientific);

  const topics = buildCategoryDepthTopics({ category: 'bird', scientific, dossier });
  assert.deepEqual(topicKeys(topics), ['feeding', 'habitat', 'reproduction']);
  assert.ok(topics.every((topic) => topic.sourceIds.join(',') === 'gbif,wikidata'));
});

test('an exact fish outside the local catalogue exposes only facts with WoRMS and Wikidata proof', () => {
  const scientific = 'Piaractus mesopotamicus';
  const dossier = normaliseSpeciesDossier({
    scientific,
    environment: { marine: false, brackish: false, freshwater: true },
    diet: [{ id: 'Q152', label: 'sementes' }],
    habitat: [],
    reproduction: [],
    lifeCycle: [],
    conservation: null,
    sources: [SOURCE.worms, SOURCE.wikidata],
  }, scientific);

  const topics = buildCategoryDepthTopics({ category: 'fish', scientific, dossier });
  assert.deepEqual(topicKeys(topics), ['environment', 'feeding']);
  assert.deepEqual(topics[0].sourceIds, ['worms']);
  assert.deepEqual(topics[1].sourceIds, ['worms', 'wikidata']);
});

test('outside-catalog contracts fail closed on identity or provenance mismatch', () => {
  const catalogue = readJson('public/locales/en.json').discover.topics;
  const localNames = new Set([
    ...catalogue.gardenInsects.species,
    ...catalogue.birdsOfTheWorld.species,
    ...catalogue.oceanAndRiverFish.species,
  ].map((entry) => entry.sci));
  for (const scientific of ['Danaus plexippus', 'Turdus migratorius', 'Piaractus mesopotamicus']) {
    assert.equal(localNames.has(scientific), false, `${scientific} must exercise dynamic coverage`);
  }

  const bird = {
    scientific: 'Turdus migratorius',
    diet: [{ id: 'Q25349', label: 'insetos' }],
    sources: [SOURCE.gbif, SOURCE.wikidata],
  };
  assert.deepEqual(buildCategoryDepthTopics({
    category: 'bird',
    scientific: 'Turdus rufiventris',
    dossier: bird,
  }), [], 'a different exact species must render nothing');
  assert.deepEqual(buildCategoryDepthTopics({
    category: 'bird',
    scientific: bird.scientific,
    dossier: { ...bird, sources: [SOURCE.wikidata] },
  }), [], 'Wikidata prose without GBIF bird identity must render nothing');

  const insect = {
    scientific: 'Danaus plexippus',
    feeding: [{ id: 'eats:GBIF:3170240', name: 'Asclepias curassavica', relation: 'eats' }],
    sources: [globi('Danaus gilippus'), SOURCE.gbif],
  };
  assert.deepEqual(buildCategoryDepthTopics({
    category: 'insect',
    scientific: insect.scientific,
    dossier: insect,
  }), [], 'a GloBI link for another source taxon must not cross species');

  const fish = {
    scientific: 'Piaractus mesopotamicus',
    diet: [{ id: 'Q152', label: 'sementes' }],
    sources: [SOURCE.wikidata],
  };
  assert.deepEqual(buildCategoryDepthTopics({
    category: 'fish',
    scientific: fish.scientific,
    dossier: fish,
  }), [], 'fish facts without the WoRMS fish proof must render nothing');
});
