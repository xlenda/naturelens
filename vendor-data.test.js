const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const IDENTIFY_FILE = path.join(__dirname, 'api', 'identify.js');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadIdentifyHarness() {
  const fixtures = {
    kindwise: [],
    fishial: [],
    nyckel: [],
    perch: [],
  };
  const calls = [];
  const moduleRecord = { exports: {} };
  const kindwiseIdentify = async (options) => {
    calls.push(options);
    assert.ok(fixtures.kindwise.length, 'a Kindwise fixture must be queued before running a category');
    return fixtures.kindwise.shift();
  };

  const nextFixture = (provider) => async () => {
    assert.ok(fixtures[provider].length, `a ${provider} fixture must be queued before running it`);
    return fixtures[provider].shift();
  };

  const dependencies = {
    './_lib/kindwise': { kindwiseIdentify, requireMethod: () => true },
    './_lib/fishial': { fishialIdentify: nextFixture('fishial') },
    './_lib/nyckel': { nyckelIdentify: nextFixture('nyckel') },
    './_lib/bioclipBird': {
      bioclipBirdIdentify: async () => null,
      isBioClipConfigured: () => false,
    },
    './_lib/birdDossier': { resolveExactBirdLabel: async () => null },
    './_lib/perch': { perchIdentify: nextFixture('perch') },
    './_lib/translate': {
      translateVendorText: async (value) => value,
      looksLikeProse: () => false,
      normaliseLanguage: (value) => String(value || 'en').toLowerCase(),
    },
    './_lib/supabaseAdmin': { requireDeviceId: () => 'test-device' },
    './_lib/entitlement': {
      checkEntitlement: async () => ({ allowed: true, subscribed: true }),
      releaseUsage: async () => {},
    },
    './_lib/rateLimit': { checkRateLimit: async () => true },
    './_lib/translateEntity': { translateEntity: async (entity) => entity },
    '../components/taxonIdentity': require('./components/taxonIdentity'),
  };

  const source = fs.readFileSync(IDENTIFY_FILE, 'utf8');
  const instrumented = `${source}\nmodule.exports.__vendorDataTest = {\n` +
    '  CATEGORIES, PLANT_DETAILS, mapPlantLike, mapAlternatives, mapSoundAlternatives,\n' +
    '  probabilityPercent, vendorProbability, mapSimilarImages\n' +
    '};\n';
  vm.runInNewContext(instrumented, {
    module: moduleRecord,
    exports: moduleRecord.exports,
    require(id) {
      if (dependencies[id]) return dependencies[id];
      throw new Error(`Unexpected dependency in identify fixture: ${id}`);
    },
    console,
    process: { env: {} },
  }, { filename: IDENTIFY_FILE });

  return {
    hooks: moduleRecord.exports.__vendorDataTest,
    calls,
    queue(...values) {
      fixtures.kindwise.push(...values);
    },
    queueProvider(provider, ...values) {
      fixtures[provider].push(...values);
    },
  };
}

function classificationFixture(subjectKey, subjectProbability, suggestion) {
  const result = {
    classification: { suggestions: [suggestion] },
  };
  if (subjectKey) result[subjectKey] = { probability: subjectProbability };
  return { result };
}

test('plant and tree keep vendor names, synonyms, GBIF id and raw subject probability', async () => {
  const harness = loadIdentifyHarness();
  const plant = classificationFixture('is_plant', 0, {
    id: 17,
    name: 'Rosa rubiginosa',
    details: {
      common_names: ['Sweet briar', 'Eglantine', 'Briar rose'],
      synonyms: ['Rosa eglanteria', 'Rosa suaveolens'],
      gbif_id: 3002461,
      description: {
        value: 'Vendor description.',
        citation: 'Kindwise editorial source',
        license_name: 'CC BY-SA 4.0',
        license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
    },
  });
  plant.result.classification.suggestions.push(
    { id: 18, name: 'Rosa canina', details: {} },
    { id: 19, name: 'Rosa agrestis', probability: 0, details: {} }
  );
  const tree = classificationFixture(null, null, {
    id: 20,
    name: 'Quercus robur',
    probability: 0,
    details: {
      common_names: ['English oak', 'Pedunculate oak'],
      synonyms: ['Quercus pedunculata'],
      gbif_id: '2878688',
      description: 'String description without invented license metadata.',
    },
  });
  harness.queue(plant, tree);

  const plantResult = plain(await harness.hooks.CATEGORIES.plant.run({ language: 'pt' }));
  const treeResult = plain(await harness.hooks.CATEGORIES.tree.run({ language: 'unsupported' }));

  for (const call of harness.calls) {
    assert.ok(call.details.split(',').includes('gbif_id'));
    assert.ok(call.details.split(',').includes('synonyms'));
    assert.ok(call.details.split(',').includes('images'));
  }
  assert.equal(plantResult.entity.name, 'Sweet briar');
  assert.equal(plantResult.entity.commonNames, 'Eglantine, Briar rose');
  assert.equal(plantResult.entity.synonyms, 'Rosa eglanteria, Rosa suaveolens');
  assert.equal(plantResult.entity.gbifId, 3002461);
  assert.equal(plantResult.entity.sourceProvider, 'plant.id');
  assert.equal(plantResult.entity.resultLanguage, 'pt');
  assert.equal(plantResult.entity.overviewCitation, 'Kindwise editorial source');
  assert.equal(plantResult.entity.overviewLicense, 'CC BY-SA 4.0');
  assert.equal(
    plantResult.entity.overviewLicenseUrl,
    'https://creativecommons.org/licenses/by-sa/4.0/'
  );
  assert.equal(plantResult.entity.subjectProbability, 0);
  assert.equal(plantResult.isPlant, 0, 'the old outer field remains compatible');
  assert.equal(plantResult.entity.confidence, null, 'missing probability is not invented as zero');
  assert.equal(plantResult.entity.alternatives[0].confidence, null);
  assert.equal(plantResult.entity.alternatives[1].confidence, 0);

  assert.equal(treeResult.entity.commonNames, 'Pedunculate oak');
  assert.equal(treeResult.entity.synonyms, 'Quercus pedunculata');
  assert.equal(treeResult.entity.gbifId, '2878688');
  assert.equal(treeResult.entity.sourceProvider, 'plant.id');
  assert.equal(treeResult.entity.resultLanguage, 'en');
  assert.equal(treeResult.entity.overviewCitation, null);
  assert.equal(treeResult.entity.overviewLicense, null);
  assert.equal(treeResult.entity.overviewLicenseUrl, null);
  assert.equal(treeResult.entity.subjectProbability, null);
  assert.equal(treeResult.isPlant, null);
  assert.equal(treeResult.entity.confidence, 0, 'a real zero remains zero');
});

test('insect and mushroom preserve the same vendor identity evidence', async () => {
  const harness = loadIdentifyHarness();
  const insect = classificationFixture('is_insect', 0.625, {
    id: 'bee-1',
    name: 'Apis mellifera',
    details: {
      common_names: ['Western honey bee', 'European honey bee'],
      synonyms: ['Apis mellifica'],
      gbif_id: 1341976,
      description: 'Vendor insect description.',
      taxonomy: { class: 'Insecta', phylum: 'Arthropoda' },
    },
  });
  const mushroom = classificationFixture(null, null, {
    id: 'amanita-1',
    name: 'Amanita phalloides',
    probability: 0,
    details: {
      common_names: ['Death cap', 'Deathcap'],
      synonyms: ['Agaricus phalloides'],
      gbif_id: 5240303,
      description: {
        value: 'Vendor mushroom description.',
        citation: 'Mycological source',
        license_name: 'CC BY 4.0',
        license_url: 'https://creativecommons.org/licenses/by/4.0/',
      },
      look_alike: [
        {
          name: 'Amanita caesarea',
          url: 'https://example.test/amanita-caesarea',
          description: 'Full vendor comparison.',
        },
        {
          name: 'Volvopluteus gloiocephalus',
          distinguishing_features: ['pink spores', 'no ring'],
        },
      ],
    },
  });
  harness.queue(insect, mushroom);

  const insectResult = plain(await harness.hooks.CATEGORIES.insect.run({ language: 'pt' }));
  const mushroomResult = plain(await harness.hooks.CATEGORIES.mushroom.run({ language: 'de' }));

  for (const call of harness.calls) {
    assert.ok(call.details.split(',').includes('gbif_id'));
    assert.ok(call.details.split(',').includes('synonyms'));
    assert.ok(call.details.split(',').includes('images'));
  }
  assert.equal(insectResult.entity.commonNames, 'European honey bee');
  assert.equal(insectResult.entity.synonyms, 'Apis mellifica');
  assert.equal(insectResult.entity.gbifId, 1341976);
  assert.equal(insectResult.entity.taxonClass, 'Insecta');
  assert.equal(insectResult.entity.taxonPhylum, 'Arthropoda');
  assert.equal(insectResult.entity.sourceProvider, 'insect.id');
  assert.equal(insectResult.entity.resultLanguage, 'pt');
  assert.equal(insectResult.entity.overviewLicense, null);
  assert.equal(insectResult.entity.subjectProbability, 0.625);
  assert.equal(insectResult.isInsect, 0.625, 'the old outer field remains compatible');
  assert.equal(insectResult.entity.confidence, null);

  assert.deepEqual(mushroomResult.entity.lookAlike, [
    'Amanita caesarea',
    'Volvopluteus gloiocephalus',
  ]);
  assert.equal(mushroomResult.entity.lookAlikeDetails[0].url, 'https://example.test/amanita-caesarea');
  assert.deepEqual(mushroomResult.entity.lookAlikeDetails[1].distinguishing_features, [
    'pink spores',
    'no ring',
  ]);
  assert.equal(mushroomResult.entity.commonNames, 'Deathcap');
  assert.equal(mushroomResult.entity.synonyms, 'Agaricus phalloides');
  assert.equal(mushroomResult.entity.gbifId, 5240303);
  assert.equal(mushroomResult.entity.sourceProvider, 'mushroom.id');
  assert.equal(mushroomResult.entity.resultLanguage, 'de');
  assert.equal(mushroomResult.entity.overviewCitation, 'Mycological source');
  assert.equal(mushroomResult.entity.overviewLicense, 'CC BY 4.0');
  assert.equal(
    mushroomResult.entity.overviewLicenseUrl,
    'https://creativecommons.org/licenses/by/4.0/'
  );
  assert.equal(mushroomResult.entity.subjectProbability, null);
  assert.equal(mushroomResult.isMushroom, null);
  assert.equal(mushroomResult.entity.confidence, 0);
});

test('Kindwise photo evidence keeps every licence, removes duplicates and limits last', () => {
  const { hooks } = loadIdentifyHarness();
  const similar = Array.from({ length: 9 }, (_, index) => ({
    url_small: `https://img.test/sim-${index}.jpg`,
    url: `https://img.test/full-${index}.jpg`,
    similarity: 0.9 - index / 100,
    citation: `Author ${index}`,
    license_name: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
  }));
  similar.splice(1, 0, { url: 'not-a-url' });
  const refs = plain(hooks.mapSimilarImages({
    similar_images: similar,
    details: {
      image: {
        value: 'https://img.test/representative.jpg',
        citation: 'Representative author',
        license_name: 'CC BY-SA 4.0',
        license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
      images: [
        { value: 'https://img.test/representative.jpg' },
        { value: 'https://img.test/second-representative.jpg', citation: 'Second author' },
      ],
    },
  }));

  assert.equal(refs.length, 10, 'the limit is applied after invalid and duplicate records leave');
  assert.equal(refs[0].kind, 'similar');
  assert.equal(refs[0].licenseName, 'CC BY 4.0');
  assert.equal(refs[0].licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(refs[0].similarity, 90);
  assert.equal(refs[9].kind, 'representative');
  assert.equal(refs[9].full, 'https://img.test/representative.jpg');
  assert.equal(refs[9].licenseName, 'CC BY-SA 4.0');
  assert.equal(refs.filter((item) => item.full === 'https://img.test/representative.jpg').length, 1);
});

test('all Kindwise confidence mapping distinguishes absent probability from real zero', async () => {
  const harness = loadIdentifyHarness();
  harness.queue({
    result: {
      crop: {
        suggestions: [{
          id: 'maize',
          name: 'Zea mays',
          scientific_name: 'Zea mays',
          details: {
            common_names: ['Maize'],
            gbif_id: '5290052',
            description: {
              value: 'Crop description.',
              citation: 'Crop source',
              license_name: 'CC BY 3.0',
              license_url: 'https://creativecommons.org/licenses/by/3.0/',
            },
          },
        }],
      },
      disease: {
        suggestions: [{
          id: 'rust',
          name: 'Common rust',
          probability: 0,
          details: {
            common_names: ['Common rust', 'Maize rust'],
            gbif_id: '2517111',
            eppo_code: 'PUCCSO',
            eppo_regulation_status: { Exampleland: 'Quarantine pest' },
            description: {
              value: 'Disease description.',
              citation: 'Disease source',
              license_name: 'CC0',
              license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
            },
          },
        }],
      },
    },
  });

  const cropResult = plain(await harness.hooks.CATEGORIES.crop.run({ language: 'es' }));
  assert.equal(cropResult.entity.confidence, null);
  assert.equal(cropResult.entity.gbifId, '5290052');
  assert.equal(cropResult.entity.disease.confidence, 0);
  assert.equal(cropResult.entity.disease.commonNames, 'Common rust, Maize rust');
  assert.equal(cropResult.entity.disease.gbifId, '2517111');
  assert.equal(cropResult.entity.disease.eppoCode, 'PUCCSO');
  assert.equal(cropResult.entity.disease.eppoRegulationStatus.Exampleland, 'Quarantine pest');
  assert.equal(cropResult.entity.sourceProvider, 'crop.health');
  assert.equal(cropResult.entity.resultLanguage, 'es');
  assert.equal(cropResult.entity.overviewCitation, 'Crop source');
  assert.equal(cropResult.entity.overviewLicense, 'CC BY 3.0');
  assert.equal(cropResult.entity.disease.overviewCitation, 'Disease source');
  assert.equal(cropResult.entity.disease.overviewLicense, 'CC0');
  assert.equal(harness.hooks.probabilityPercent(undefined), null);
  assert.equal(harness.hooks.probabilityPercent(Number.NaN), null);
  assert.equal(harness.hooks.probabilityPercent(0), 0);
  assert.equal(harness.hooks.vendorProbability(undefined), null);
  assert.equal(harness.hooks.vendorProbability(0), 0);
});

test('sound alternatives retain the provider group without changing their old shape', () => {
  const { hooks } = loadIdentifyHarness();
  const alternatives = plain(hooks.mapSoundAlternatives([
    { code: 'top', label: 'Top species', score: 0.9, group: 'bird' },
    {
      code: 'frog',
      label: 'Hyla arborea',
      scientific_name: 'Hyla arborea',
      score: 0.41,
      group: 'amphibian',
    },
    {
      code: 'cricket',
      label: 'Acheta domesticus',
      scientific_name: 'Acheta domesticus',
      score: 0.2,
      group: 'insect',
    },
  ]));

  assert.deepEqual(alternatives.map(({ id, name, scientific, confidence }) => ({
    id, name, scientific, confidence,
  })), [
    { id: 'frog', name: 'Hyla arborea', scientific: 'Hyla arborea', confidence: 41 },
    { id: 'cricket', name: 'Acheta domesticus', scientific: 'Acheta domesticus', confidence: 20 },
  ]);
  assert.deepEqual(alternatives.map((item) => item.group), ['amphibian', 'insect']);
});

test('Fishial, Perch and Nyckel also keep missing confidence distinct from zero', async () => {
  const harness = loadIdentifyHarness();
  harness.queueProvider('fishial', {
    results: [{
      'detection-score': 0,
      species: [
        {
          'species-id': 'fish-top',
          name: 'Amphiprion ocellaris',
          'fishangler-data': {
            title: 'Clownfish',
            scientificName: 'Amphiprion ocellaris',
          },
        },
        {
          'species-id': 'fish-alt',
          name: 'Amphiprion percula',
          accuracy: 0,
          'fishangler-data': {
            title: 'Orange clownfish',
            scientificName: 'Amphiprion percula',
          },
        },
      ],
    }],
  });
  harness.queueProvider(
    'perch',
    { confident: true, predictions: [{ code: 'one', label: 'First bird', group: 'bird' }] },
    { confident: true, predictions: [{ code: 'two', label: 'Second bird', score: 0, group: 'bird' }] }
  );
  harness.queueProvider(
    'nyckel',
    { labelId: 'bird-one', labelName: 'First bird' },
    { labelId: 'bird-two', labelName: 'Second bird', confidence: 0 }
  );

  const fish = plain(await harness.hooks.CATEGORIES.fish.run({ language: 'pt' }));
  const soundMissing = plain(await harness.hooks.CATEGORIES.sound.run({}));
  const soundZero = plain(await harness.hooks.CATEGORIES.sound.run({}));
  const birdMissing = plain(await harness.hooks.CATEGORIES.bird.run({}));
  const birdZero = plain(await harness.hooks.CATEGORIES.bird.run({}));

  assert.equal(fish.entity.confidence, null);
  assert.equal(fish.entity.detectionScore, 0);
  assert.equal(fish.entity.alternatives[0].confidence, 0);
  assert.equal(fish.entity.sourceProvider, 'fishial');
  assert.equal(fish.entity.resultLanguage, 'en');
  assert.equal(soundMissing.entity.confidence, null);
  assert.equal(soundZero.entity.confidence, 0);
  assert.equal(soundMissing.entity.sourceProvider, 'perch');
  assert.equal(soundMissing.entity.resultLanguage, 'en');
  assert.equal(birdMissing.entity.confidence, null);
  assert.equal(birdZero.entity.confidence, 0);
  assert.equal(birdMissing.entity.sourceProvider, 'nyckel');
  assert.equal(birdMissing.entity.resultLanguage, 'en');
});
