const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const read = (relative) => fs.readFileSync(path.join(__dirname, relative), 'utf8');

function loadGbifPhotos() {
  const { code } = babel.transformFileSync(path.join(__dirname, 'components/gbifPhotos.js'), {
    presets: ['babel-preset-expo'],
  });
  const storage = { getItem: async () => null, setItem: async () => {} };
  const stubs = {
    '@react-native-async-storage/async-storage': storage,
    './gbifTaxonKey': { GBIF_UA: 'test', getTaxonKey: async () => '123' },
  };
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(
    mod,
    mod.exports,
    (name) => (name in stubs ? stubs[name] : require(name))
  );
  return mod.exports;
}

function loadModule(relative, stubs = {}) {
  const { code } = babel.transformFileSync(path.join(__dirname, relative), {
    presets: ['babel-preset-expo'],
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(
    mod,
    mod.exports,
    (name) => (name in stubs ? stubs[name] : require(name))
  );
  return mod.exports;
}

test('GBIF gallery accepts only licences compatible with a commercial app', () => {
  const { isCommercialImageLicense } = loadGbifPhotos();
  assert.equal(isCommercialImageLicense('http://creativecommons.org/publicdomain/zero/1.0/'), true);
  assert.equal(isCommercialImageLicense('https://creativecommons.org/licenses/by/4.0/'), true);
  assert.equal(isCommercialImageLicense('https://creativecommons.org/licenses/by-sa/4.0/'), true);
  assert.equal(isCommercialImageLicense('https://creativecommons.org/licenses/by-nc/4.0/'), false);
  assert.equal(isCommercialImageLicense('https://creativecommons.org/licenses/by-nd/4.0/'), false);
  assert.equal(isCommercialImageLicense('CC BY-NC 4.0'), false);
  assert.equal(isCommercialImageLicense('all rights reserved'), false);
});

test('GBIF gallery keeps one credited photo per occurrence and fails closed', () => {
  const { mapOccurrencePhotos } = loadGbifPhotos();
  const rows = [
    {
      key: 10,
      recordedBy: 'Observer A',
      media: [
        {
          identifier: 'https://img.test/non-commercial.jpg',
          license: 'https://creativecommons.org/licenses/by-nc/4.0/',
        },
        {
          identifier: 'https://img.test/a.jpg',
          references: 'https://source.test/a',
          creator: 'Photographer A',
          publisher: 'Museum A',
          license: 'https://creativecommons.org/licenses/by/4.0/',
        },
        {
          identifier: 'https://img.test/a-second-angle.jpg',
          license: 'https://creativecommons.org/licenses/by/4.0/',
        },
      ],
    },
    {
      key: 11,
      occurrenceStatus: 'ABSENT',
      media: [{ identifier: 'https://img.test/absent.jpg', license: 'CC0' }],
    },
    {
      key: 12,
      recordedBy: 'Observer B',
      media: [{
        identifier: 'https://img.test/b.jpg',
        license: 'https://creativecommons.org/publicdomain/zero/1.0/',
      }],
    },
  ];
  const photos = mapOccurrencePhotos(rows);

  assert.deepEqual(photos.map((photo) => photo.url), [
    'https://img.test/a.jpg',
    'https://img.test/b.jpg',
  ]);
  assert.equal(photos[0].citation, 'Photographer A · Museum A · GBIF');
  assert.equal(photos[0].sourceUrl, 'https://source.test/a');
  assert.equal(photos[0].licenseName, 'CC BY');
  assert.equal(photos[1].licenseName, 'CC0');
  assert.equal(photos.every((photo) => photo.kind === 'observation'), true);
});

test('evidence deck deduplicates canonical sources without mixing semantic priority', () => {
  const { canonicalEvidenceKey, mergeEvidencePhotos, evidenceLabelKey } = loadModule(
    'components/evidencePhotos.js'
  );
  const similar = {
    url: 'https://cdn.test/a-small.jpg',
    full: 'https://cdn.test/a.jpg',
    sourceUrl: 'https://catalog.test/record/42?utm_source=app',
    kind: 'similar',
  };
  const duplicateObservation = {
    url: 'https://cdn.test/a-other-size.jpg',
    sourceUrl: 'https://catalog.test/record/42#media',
    kind: 'observation',
  };
  const observation = {
    url: 'https://cdn.test/b.jpg',
    sourceUrl: 'https://catalog.test/record/99',
    kind: 'observation',
  };

  const merged = mergeEvidencePhotos([similar], [duplicateObservation, observation]);
  assert.deepEqual(merged, [similar, observation]);
  assert.equal(canonicalEvidenceKey(similar), 'source:https://catalog.test/record/42');
  assert.equal(evidenceLabelKey(similar), 'identify.evidenceSimilar');
  assert.equal(evidenceLabelKey(observation), 'identify.evidenceObservation');
});

test('the shared gallery is large, swipeable, attributed and opens in-app', () => {
  const gallery = read('components/IdentificationExtras.js');
  const comparison = read('components/PhotoComparisonModal.js');
  const hero = read('components/PlantHero.js');
  const bird = read('screens/BirdDetailScreen.js');

  assert.match(gallery, /const PHOTO_WIDTH = 254/);
  assert.match(gallery, /height: 176/);
  assert.match(gallery, /<FlatList/);
  assert.match(gallery, /initialNumToRender=\{3\}/);
  assert.match(gallery, /evidenceLabelKey\(img\)/);
  assert.match(gallery, /!!entity\.photoUri/);
  assert.match(gallery, /<PhotoComparisonModal/);
  assert.match(gallery, /snapToInterval=\{PHOTO_WIDTH \+ PHOTO_GAP\}/);
  assert.match(gallery, /visible=\{!!selected\}/);
  assert.match(gallery, /selected\.photo\.licenseName/);
  assert.match(gallery, /selected\.photo\.sourceUrl/);
  assert.match(gallery, /onError=\{\(\) => setFailed/);
  assert.match(hero, /if \(entity\?\.photoUri\) return 0/);
  assert.match(hero, /height = 164/);
  assert.doesNotMatch(hero, /styles\.mosaicMain|styles\.mosaicSide/);
  assert.equal((bird.match(/<IdentificationExtras\b/g) || []).length, 1);
  assert.doesNotMatch(bird, /style=\{styles\.refPhoto\}/);
  assert.match(bird, /scientific=\{resolvedScientific\}/);
  assert.match(comparison, /const MODES = Object\.freeze\(\['user', 'split', 'reference'\]\)/);
  assert.match(comparison, /previousReference/);
  assert.match(comparison, /nextReference/);
  assert.match(comparison, /reference\.sourceUrl/);
});

test('each category keeps its hot evidence in the right editorial order', () => {
  const crop = read('screens/CropDetailScreen.js');
  const insect = read('screens/InsectDetailScreen.js');
  const mushroom = read('screens/MushroomDetailScreen.js');
  const bird = read('screens/BirdDetailScreen.js');

  assert.ok(crop.indexOf('<DiseaseReport') < crop.indexOf('<IdentificationExtras'));
  assert.ok(insect.indexOf('<IdentificationExtras') < insect.indexOf('<QuickFactGrid'));
  assert.ok(insect.indexOf('<QuickFactGrid') < insect.indexOf('<DistributionMap'));
  assert.ok(mushroom.indexOf('<IdentificationExtras') < mushroom.indexOf('<QuickFactGrid'));
  assert.ok(mushroom.indexOf('<QuickFactGrid') < mushroom.indexOf('<DistributionMap'));
  assert.ok(bird.indexOf('detail.birdCoverageNote') < bird.indexOf('<IdentificationExtras'));
});

test('Wikipedia keeps text provenance separate from the actual image licence', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('api/rest_v1/page/summary')) {
      return {
        ok: true,
        json: async () => ({
          title: 'Monstera deliciosa',
          thumbnail: { source: 'https://upload.wikimedia.org/thumb.jpg', width: 600, height: 400 },
          originalimage: { source: 'https://upload.wikimedia.org/a/b/Monstera_deliciosa.jpg' },
          content_urls: { desktop: { page: 'https://pt.wikipedia.org/wiki/Monstera_deliciosa' } },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        query: {
          pages: {
            1: {
              imageinfo: [{
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Monstera_deliciosa.jpg',
                extmetadata: {
                  Artist: { value: '<a>Jane Doe</a>' },
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                  LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
                },
              }],
            },
          },
        },
      }),
    };
  };

  try {
    const { getSpeciesInfo } = loadModule('components/speciesPhoto.js');
    const info = await getSpeciesInfo('Monstera deliciosa', 'pt');
    assert.equal(info.sourceUrl, 'https://pt.wikipedia.org/wiki/Monstera_deliciosa');
    assert.equal(info.imageSourceUrl, 'https://commons.wikimedia.org/wiki/File:Monstera_deliciosa.jpg');
    assert.equal(info.imageCreator, 'Jane Doe');
    assert.equal(info.imageLicense, 'CC BY-SA 4.0');
    assert.equal(info.imageLicenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/');
    assert.equal(calls.some((url) => url.includes('iiprop=url%7Cextmetadata')), true);
  } finally {
    global.fetch = originalFetch;
  }
});
