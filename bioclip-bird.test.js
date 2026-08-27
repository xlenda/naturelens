const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  BioClipBirdError,
  bioclipBirdIdentify,
  collectImages,
  isBioClipConfigured,
  validateEndpoint,
  validateHostPayload,
} = require('./api/_lib/bioclipBird');
const {
  buildIdentityV1,
  sanitiseIdentityV1,
} = require('./components/taxonIdentity');

const IMAGE = 'data:image/jpeg;base64,AA==';
const EXACT_SOURCE = 'bioclip.predictions[].score.margin+gbif.species.match';
const SCIENTIFIC_SOURCE =
  'birdnet-taxonomy.AviList.scientific_name+gbif.species.match';

function response(payload, { status = 200, contentType = 'application/json' } = {}) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-type') return contentType;
        if (name.toLowerCase() === 'content-length') return String(Buffer.byteLength(raw));
        return null;
      },
    },
    async text() {
      return raw;
    },
  };
}

function hostPayload(overrides = {}) {
  return {
    schemaVersion: 1,
    model: 'imageomics/bioclip-2',
    modelRevision: '2957b322090f9cb17ae72c71981c7218a28d81e0',
    scoreType: 'cosine_similarity',
    taxonomy: {
      source: 'birdnet-taxonomy/AviList',
      version: 'v0.3-Jul2026',
      taxonGroup: 'Aves',
    },
    topMargin: 0.12,
    predictions: [
      {
        scientificName: 'Turdus migratorius',
        commonName: 'American Robin',
        birdnetId: 'BN123',
        gbifKey: 9510564,
        rank: 'species',
        taxonGroup: 'Aves',
        score: 0.42,
      },
      {
        scientificName: 'Turdus rufiventris',
        commonName: 'Rufous-bellied Thrush',
        birdnetId: 'BN456',
        gbifKey: 2490719,
        rank: 'species',
        taxonGroup: 'Aves',
        score: 0.30,
      },
    ],
    ...overrides,
  };
}

function configuredEnv(overrides = {}) {
  return {
    BIOCLIP_BIRD_ENDPOINT: 'https://birds.example.com/v1/identify',
    BIOCLIP_BIRD_AUTH_TOKEN: 'secret-token',
    BIOCLIP_BIRD_THRESHOLD_SET_ID: 'global-birds-test-v1',
    BIOCLIP_BIRD_MIN_SIMILARITY: '0.40',
    BIOCLIP_BIRD_MIN_MARGIN: '0.10',
    ...overrides,
  };
}

test('BioCLIP endpoint rejects SSRF-shaped and non-TLS URLs', () => {
  for (const url of [
    'http://birds.example.com/v1/identify',
    'https://127.0.0.1/v1/identify',
    'https://[::1]/v1/identify',
    'https://localhost/v1/identify',
    'https://birds.internal/v1/identify',
    'https://user:pass@birds.example.com/v1/identify',
    'https://birds.example.com/v1/identify?next=https://169.254.169.254',
  ]) {
    assert.throws(() => validateEndpoint(url), BioClipBirdError, url);
  }
  assert.equal(
    validateEndpoint('https://birds.example.com/v1/identify'),
    'https://birds.example.com/v1/identify'
  );
});

test('endpoint alone cannot activate an uncalibrated BioCLIP model', () => {
  assert.equal(isBioClipConfigured({ BIOCLIP_BIRD_ENDPOINT: 'https://birds.example.com/v1/identify' }), false);
  assert.equal(isBioClipConfigured(configuredEnv()), true);
  assert.equal(
    isBioClipConfigured(configuredEnv({ BIOCLIP_BIRD_MIN_MARGIN: 'not-a-number' })),
    false
  );
});

test('client enforces at most three valid images', () => {
  assert.equal(collectImages(null, [IMAGE, IMAGE, IMAGE]).length, 3);
  assert.throws(() => collectImages(null, [IMAGE, IMAGE, IMAGE, IMAGE]), /at most 3/);
  assert.throws(() => collectImages('data:image/gif;base64,AA=='), /JPEG, PNG, or WebP/);
  assert.throws(() => collectImages(null, []), /At least one/);
});

test('host contract rejects wrong class, rank, score type, order and margin', () => {
  const wrongClass = hostPayload();
  wrongClass.predictions[0].taxonGroup = 'Mammalia';
  assert.throws(() => validateHostPayload(wrongClass), /invalid bird prediction/);

  assert.throws(
    () => validateHostPayload(hostPayload({ scoreType: 'probability' })),
    /contract did not validate/
  );

  const wrongOrder = hostPayload();
  wrongOrder.predictions[1].score = 0.5;
  wrongOrder.topMargin = 0;
  assert.throws(() => validateHostPayload(wrongOrder), /not ranked/);

  assert.throws(
    () => validateHostPayload(hostPayload({ topMargin: 0.5 })),
    /margin is inconsistent/
  );
});

test('client rejects non-JSON and oversized response bodies before trusting fields', async () => {
  await assert.rejects(
    bioclipBirdIdentify({
      image: IMAGE,
      env: configuredEnv(),
      fetchImpl: async () => response('{}', { contentType: 'text/plain' }),
    }),
    /did not return JSON/
  );

  await assert.rejects(
    bioclipBirdIdentify({
      image: IMAGE,
      env: configuredEnv(),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: {
          get(name) {
            return name.toLowerCase() === 'content-length'
              ? String(200 * 1024)
              : 'application/json';
          },
        },
        async text() {
          throw new Error('body must not be read after the length guard');
        },
      }),
    }),
    /response is too large/
  );
});

test('request payload is bounded, authenticated and exact only after GBIF proof', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return response(hostPayload());
    return response({
      usageKey: 9510564,
      canonicalName: 'Turdus migratorius',
      matchType: 'EXACT',
      rank: 'SPECIES',
      status: 'ACCEPTED',
      kingdom: 'Animalia',
      class: 'Aves',
    });
  };

  const result = await bioclipBirdIdentify({
    images: [IMAGE, IMAGE],
    env: configuredEnv(),
    fetchImpl,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://birds.example.com/v1/identify');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.signal instanceof AbortSignal, true);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
  assert.equal(calls[0].init.headers['X-NatureLens-Contract'], '1');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    schemaVersion: 1,
    images: [IMAGE, IMAGE],
    topK: 3,
  });
  assert.match(calls[1].url, /^https:\/\/api\.gbif\.org\/v1\/species\/match\?/);
  assert.equal(result.scoreType, 'cosine_similarity');
  assert.equal(result.prediction.score, 0.42);
  assert.equal(result.topMargin, 0.12);
  assert.equal(result.identityEvidence.exact, true);
  assert.equal(result.identityEvidence.source, EXACT_SOURCE);
});

test('ambiguity and GBIF mismatch remain candidates, never exact', async () => {
  let calls = 0;
  const belowMargin = hostPayload({ topMargin: 0.02 });
  belowMargin.predictions[1].score = 0.40;
  const ambiguous = await bioclipBirdIdentify({
    image: IMAGE,
    env: configuredEnv(),
    fetchImpl: async () => {
      calls += 1;
      return response(belowMargin);
    },
  });
  assert.equal(calls, 1, 'GBIF is not called before the calibrated margin passes');
  assert.equal(ambiguous.identityEvidence.exact, false);
  assert.equal(ambiguous.identityEvidence.reason, 'below_calibrated_threshold');

  const mismatch = await bioclipBirdIdentify({
    image: IMAGE,
    env: configuredEnv(),
    fetchImpl: async () => {
      calls += 1;
      return calls === 2
        ? response(hostPayload())
        : response({
            usageKey: 1,
            canonicalName: 'Corvus corax',
            matchType: 'EXACT',
            rank: 'SPECIES',
            status: 'ACCEPTED',
            kingdom: 'Animalia',
            class: 'Aves',
          });
    },
  });
  assert.equal(mismatch.identityEvidence.exact, false);
  assert.equal(mismatch.identityEvidence.reason, 'gbif_mismatch');
});

function bioclipIdentity(overrides = {}) {
  return buildIdentityV1({
    category: 'bird',
    provider: 'bioclip-2',
    providerTaxonId: 'BN123',
    providerLabel: 'American Robin',
    providerTaxonIdSource: 'birdnet-taxonomy.birdnet_id',
    providerLabelSource: 'birdnet-taxonomy.common_name',
    scientificName: 'Turdus migratorius',
    scientificNameSource: SCIENTIFIC_SOURCE,
    gbifKey: 9510564,
    gbifKeySource: 'gbif.species.match.usageKey',
    exactEvidence: true,
    exactEvidenceSource: EXACT_SOURCE,
    similarity: 0.42,
    similaritySource: 'predictions[].score:cosine_similarity',
    topMargin: 0.12,
    topMarginSource: 'predictions[0].score-predictions[1].score',
    similarityThreshold: 0.4,
    marginThreshold: 0.1,
    thresholdSetId: 'global-birds-test-v1',
    ...overrides,
  });
}

test('identity contract never turns BioCLIP cosine similarity into probability', () => {
  const exact = bioclipIdentity();
  assert.equal(exact.status, 'exact');
  assert.equal(exact.confidence.score, null);
  assert.equal(exact.confidence.similarity, 0.42);
  assert.equal(exact.verification.thresholdSetId, 'global-birds-test-v1');

  assert.equal(bioclipIdentity({ exactEvidence: false }).status, 'candidate');
  assert.equal(bioclipIdentity({ topMargin: 0.01 }).status, 'candidate');
  assert.equal(bioclipIdentity({ gbifKey: null }).status, 'candidate');
  assert.equal(
    bioclipIdentity({ scientificName: 'Turdus migratorius achrusterus' }).status,
    'unresolved'
  );

  const forged = JSON.parse(JSON.stringify(bioclipIdentity({ topMargin: 0.01 })));
  forged.status = 'exact';
  assert.equal(sanitiseIdentityV1(forged).status, 'candidate');
});

function loadBirdHarness({ bioclipResult, bioclipError, nyckelResult }) {
  const source = fs.readFileSync(path.join(__dirname, 'api', 'identify.js'), 'utf8');
  let nyckelCalls = 0;
  const moduleRecord = { exports: {} };
  const dependencies = {
    './_lib/kindwise': { kindwiseIdentify: async () => null, requireMethod: () => true },
    './_lib/fishial': { fishialIdentify: async () => null },
    './_lib/nyckel': {
      nyckelIdentify: async () => {
        nyckelCalls += 1;
        return nyckelResult;
      },
    },
    './_lib/bioclipBird': {
      isBioClipConfigured: () => true,
      bioclipBirdIdentify: async () => {
        if (bioclipError) throw bioclipError;
        return bioclipResult;
      },
    },
    './_lib/birdDossier': { resolveExactBirdLabel: async () => null },
    './_lib/perch': { perchIdentify: async () => null },
    './_lib/translate': {
      translateVendorText: async (value) => value,
      looksLikeProse: () => false,
      normaliseLanguage: () => 'en',
    },
    './_lib/supabaseAdmin': { requireDeviceId: () => 'device' },
    './_lib/entitlement': {
      checkEntitlement: async () => ({ allowed: true }),
      releaseUsage: async () => {},
    },
    './_lib/rateLimit': { checkRateLimit: async () => true },
    './_lib/translateEntity': { translateEntity: async (entity) => entity },
    '../components/taxonIdentity': require('./components/taxonIdentity'),
  };
  vm.runInNewContext(
    `${source}\nmodule.exports.__bioclipTest = { CATEGORIES, isEnabled };`,
    {
      module: moduleRecord,
      exports: moduleRecord.exports,
      require(id) {
        if (dependencies[id]) return dependencies[id];
        throw new Error(`Unexpected dependency ${id}`);
      },
      console: { error() {} },
      process: { env: { NYCKEL_BIRD_FUNCTION_ID: 'nyckel-bird' } },
    },
    { filename: 'api/identify.js' }
  );
  return {
    bird: moduleRecord.exports.__bioclipTest.CATEGORIES.bird,
    isEnabled: moduleRecord.exports.__bioclipTest.isEnabled,
    nyckelCalls: () => nyckelCalls,
  };
}

function exactBioResult(exact = true) {
  const payload = hostPayload();
  return {
    prediction: payload.predictions[0],
    alternatives: payload.predictions.slice(1),
    topMargin: payload.topMargin,
    thresholds: { id: 'global-birds-test-v1', minSimilarity: 0.4, minMargin: 0.1 },
    modelRevision: payload.modelRevision,
    taxonomy: { version: payload.taxonomy.version },
    identityEvidence: { exact, source: exact ? EXACT_SOURCE : null },
  };
}

test('identify prefers only proven BioCLIP exact and keeps similarity out of confidence', async () => {
  const harness = loadBirdHarness({
    bioclipResult: exactBioResult(true),
    nyckelResult: null,
  });
  const result = JSON.parse(JSON.stringify(await harness.bird.run({ image: IMAGE })));
  assert.equal(result.entity.sourceProvider, 'bioclip-2');
  assert.equal(result.entity.identityV1.status, 'exact');
  assert.equal(result.entity.confidence, null);
  assert.equal(result.entity.modelSimilarity, 0.42);
  assert.equal(harness.nyckelCalls(), 0);
});

test('ambiguous or failed BioCLIP falls back to Nyckel', async () => {
  const nyckelResult = {
    labelId: 'robin',
    labelName: 'American Robin',
    confidence: 0.9,
  };
  const inconsistentExact = exactBioResult(true);
  inconsistentExact.thresholds.minMargin = 0.5;
  for (const scenario of [
    { bioclipResult: exactBioResult(false), nyckelResult },
    { bioclipResult: inconsistentExact, nyckelResult },
    { bioclipError: new Error('host down'), nyckelResult },
  ]) {
    const harness = loadBirdHarness(scenario);
    const result = JSON.parse(JSON.stringify(await harness.bird.run({ image: IMAGE })));
    assert.equal(result.entity.sourceProvider, 'nyckel');
    assert.equal(harness.nyckelCalls(), 1);
  }
});

test('limited-coverage note disappears only for a proven BioCLIP identity', () => {
  const source = fs.readFileSync(path.join(__dirname, 'screens', 'BirdDetailScreen.js'), 'utf8');
  assert.match(source, /plant\.sourceProvider === 'bioclip-2'[\s\S]{0,100}plant\.identityV1\?\.status === 'exact'/);
  assert.match(source, /detail\.birdCoverageNote/);
});
