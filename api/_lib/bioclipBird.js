const net = require('node:net');

const CONTRACT_VERSION = 1;
const MODEL_ID = 'imageomics/bioclip-2';
const SCORE_TYPE = 'cosine_similarity';
const TAXONOMY_SOURCE = 'birdnet-taxonomy/AviList';
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 5_000_000;
const MAX_TOTAL_IMAGE_CHARS = 12_000_000;
const MAX_RESPONSE_BYTES = 96 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;
const EXACT_EVIDENCE_SOURCE =
  'bioclip.predictions[].score.margin+gbif.species.match';
const GBIF_MATCH_URL = 'https://api.gbif.org/v1/species/match';

class BioClipBirdError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'BioClipBirdError';
    this.code = code;
    this.status = options.status || null;
    if (options.cause) this.cause = options.cause;
  }
}

function cleanText(value, maxLength = 240) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean && clean.length <= maxLength ? clean : null;
}

function canonicalScientific(value) {
  const clean = cleanText(value, 160);
  if (!clean) return null;
  const words = clean.split(' ');
  if (words.length !== 2) return null;
  if (!/^[A-Z][A-Za-z.-]+$/.test(words[0])) return null;
  if (!/^[a-z][A-Za-z.-]+$/.test(words[1])) return null;
  return clean;
}

function isUnsafeHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  // A configured classifier should have a stable public TLS hostname. Refusing
  // literal IPs also closes metadata/private-network SSRF without a DNS race.
  if (net.isIP(host)) return true;
  return false;
}

function validateEndpoint(value) {
  const raw = cleanText(value, 2048);
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new BioClipBirdError('invalid_endpoint', 'BIOCLIP_BIRD_ENDPOINT is not a valid URL.');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    isUnsafeHostname(parsed.hostname)
  ) {
    throw new BioClipBirdError(
      'invalid_endpoint',
      'BIOCLIP_BIRD_ENDPOINT must be a public HTTPS URL without credentials, query, or fragment.'
    );
  }

  return parsed.toString();
}

function isBioClipConfigured(env = process.env) {
  try {
    // O endpoint sozinho nao ativa o modelo. Sem um conjunto de limiares
    // medido e nomeado, cosine similarity nao sustenta identificacao exata.
    return Boolean(validateEndpoint(env.BIOCLIP_BIRD_ENDPOINT) && readThresholds(env));
  } catch (error) {
    return false;
  }
}

function normaliseImage(value) {
  if (typeof value !== 'string') {
    throw new BioClipBirdError('invalid_image', 'Each BioCLIP image must be base64 text.');
  }
  const dataUri = value.startsWith('data:')
    ? value
    : `data:image/jpeg;base64,${value}`;
  if (dataUri.length > MAX_IMAGE_CHARS) {
    throw new BioClipBirdError('image_too_large', 'A BioCLIP image exceeds the size limit.');
  }
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUri)) {
    throw new BioClipBirdError(
      'invalid_image',
      'BioCLIP accepts only JPEG, PNG, or WebP base64 data URLs.'
    );
  }
  return dataUri;
}

function collectImages(image, images) {
  let inputs;
  if (Array.isArray(images) && images.length > 0) {
    inputs = images;
  } else if (image !== undefined && image !== null && image !== '') {
    inputs = [image];
  } else {
    throw new BioClipBirdError('missing_image', 'At least one bird image is required.');
  }

  if (inputs.length > MAX_IMAGES) {
    throw new BioClipBirdError(
      'too_many_images',
      `BioCLIP accepts at most ${MAX_IMAGES} images of the same bird.`
    );
  }
  const normalised = inputs.map(normaliseImage);
  if (normalised.reduce((total, value) => total + value.length, 0) > MAX_TOTAL_IMAGE_CHARS) {
    throw new BioClipBirdError('images_too_large', 'The BioCLIP image set exceeds the size limit.');
  }
  return normalised;
}

function responseHeader(response, name) {
  return response?.headers && typeof response.headers.get === 'function'
    ? response.headers.get(name)
    : null;
}

async function readJsonStrict(response, label) {
  const lengthHeader = responseHeader(response, 'content-length');
  if (lengthHeader && Number(lengthHeader) > MAX_RESPONSE_BYTES) {
    throw new BioClipBirdError('invalid_response', `${label} response is too large.`);
  }
  const contentType = responseHeader(response, 'content-type');
  if (!contentType || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new BioClipBirdError('invalid_response', `${label} did not return JSON.`);
  }
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new BioClipBirdError('invalid_response', `${label} response is too large.`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new BioClipBirdError('invalid_response', `${label} returned malformed JSON.`);
  }
}

function finiteNumber(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function positiveInteger(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function validatePrediction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const scientificName = canonicalScientific(value.scientificName);
  const score = finiteNumber(value.score, -1, 1);
  const commonName = value.commonName === null || value.commonName === undefined
    ? null
    : cleanText(value.commonName, 160);
  const birdnetId = value.birdnetId === null || value.birdnetId === undefined
    ? null
    : cleanText(value.birdnetId, 80);
  const gbifKey = positiveInteger(value.gbifKey);

  if (
    !scientificName ||
    score === null ||
    value.rank !== 'species' ||
    value.taxonGroup !== 'Aves' ||
    (value.commonName !== null && value.commonName !== undefined && !commonName) ||
    (birdnetId && !/^[A-Za-z0-9._:-]+$/.test(birdnetId)) ||
    !gbifKey
  ) {
    return null;
  }

  return { scientificName, commonName, birdnetId, gbifKey, score };
}

function validateHostPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BioClipBirdError('invalid_response', 'BioCLIP returned an invalid object.');
  }
  const modelRevision = cleanText(value.modelRevision, 64);
  const taxonomyVersion = cleanText(value.taxonomy?.version, 80);
  if (
    value.schemaVersion !== CONTRACT_VERSION ||
    value.model !== MODEL_ID ||
    !modelRevision ||
    !/^[0-9a-f]{7,64}$/i.test(modelRevision) ||
    value.scoreType !== SCORE_TYPE ||
    value.taxonomy?.source !== TAXONOMY_SOURCE ||
    value.taxonomy?.taxonGroup !== 'Aves' ||
    !taxonomyVersion ||
    !Array.isArray(value.predictions) ||
    value.predictions.length < 2 ||
    value.predictions.length > 5
  ) {
    throw new BioClipBirdError('invalid_response', 'BioCLIP response contract did not validate.');
  }

  const predictions = value.predictions.map(validatePrediction);
  if (predictions.some((prediction) => !prediction)) {
    throw new BioClipBirdError('invalid_response', 'BioCLIP returned an invalid bird prediction.');
  }
  const uniqueNames = new Set(predictions.map((prediction) => prediction.scientificName));
  if (uniqueNames.size !== predictions.length) {
    throw new BioClipBirdError('invalid_response', 'BioCLIP returned duplicate bird predictions.');
  }
  for (let index = 1; index < predictions.length; index += 1) {
    if (predictions[index].score > predictions[index - 1].score) {
      throw new BioClipBirdError('invalid_response', 'BioCLIP predictions are not ranked.');
    }
  }

  const derivedMargin = predictions[0].score - predictions[1].score;
  const declaredMargin = finiteNumber(value.topMargin, 0, 2);
  if (declaredMargin === null || Math.abs(declaredMargin - derivedMargin) > 1e-6) {
    throw new BioClipBirdError('invalid_response', 'BioCLIP top margin is inconsistent.');
  }

  return {
    modelRevision,
    taxonomyVersion,
    predictions,
    topMargin: derivedMargin,
  };
}

function readThresholds(env) {
  const id = cleanText(env.BIOCLIP_BIRD_THRESHOLD_SET_ID, 80);
  const rawSimilarity = cleanText(env.BIOCLIP_BIRD_MIN_SIMILARITY, 40);
  const rawMargin = cleanText(env.BIOCLIP_BIRD_MIN_MARGIN, 40);
  if (!id && !rawSimilarity && !rawMargin) return null;
  const similarity = Number(rawSimilarity);
  const margin = Number(rawMargin);
  if (
    !id ||
    !/^[A-Za-z0-9._:-]{3,80}$/.test(id) ||
    rawSimilarity === null ||
    rawMargin === null ||
    !Number.isFinite(similarity) ||
    similarity < -1 ||
    similarity > 1 ||
    !Number.isFinite(margin) ||
    margin < 0 ||
    margin > 2
  ) {
    throw new BioClipBirdError(
      'invalid_thresholds',
      'BioCLIP exact thresholds must be a named, complete calibration set.'
    );
  }
  return { id, minSimilarity: similarity, minMargin: margin };
}

function sameScientific(left, right) {
  return canonicalScientific(left)?.toLowerCase() === canonicalScientific(right)?.toLowerCase();
}

async function verifyGbifSpecies(prediction, fetchImpl, signal) {
  const url = new URL(GBIF_MATCH_URL);
  url.searchParams.set('name', prediction.scientificName);
  url.searchParams.set('rank', 'species');
  url.searchParams.set('strict', 'true');
  url.searchParams.set('verbose', 'true');

  try {
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal,
    });
    if (!response.ok) return { exact: false, reason: 'gbif_unavailable' };
    const data = await readJsonStrict(response, 'GBIF');
    const usageKey = positiveInteger(data.usageKey);
    const exact =
      data.matchType === 'EXACT' &&
      data.rank === 'SPECIES' &&
      data.status === 'ACCEPTED' &&
      data.kingdom === 'Animalia' &&
      data.class === 'Aves' &&
      sameScientific(data.canonicalName || data.scientificName, prediction.scientificName) &&
      usageKey === prediction.gbifKey;
    return exact
      ? { exact: true, gbifKey: usageKey }
      : { exact: false, reason: 'gbif_mismatch' };
  } catch (error) {
    return { exact: false, reason: 'gbif_unavailable' };
  }
}

async function bioclipBirdIdentify({
  image,
  images,
  env = process.env,
  fetchImpl = global.fetch,
} = {}) {
  const endpoint = validateEndpoint(env.BIOCLIP_BIRD_ENDPOINT);
  if (!endpoint) {
    throw new BioClipBirdError('not_configured', 'BIOCLIP_BIRD_ENDPOINT is not configured.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new BioClipBirdError('not_configured', 'This runtime does not provide fetch.');
  }
  const normalisedImages = collectImages(image, images);
  const thresholds = readThresholds(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-NatureLens-Contract': String(CONTRACT_VERSION),
    };
    const token = cleanText(env.BIOCLIP_BIRD_AUTH_TOKEN, 2048);
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          schemaVersion: CONTRACT_VERSION,
          images: normalisedImages,
          topK: 3,
        }),
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      throw new BioClipBirdError('upstream_unavailable', 'Could not reach BioCLIP.', { cause: error });
    }
    if (!response.ok) {
      throw new BioClipBirdError(
        'upstream_error',
        `BioCLIP failed with HTTP ${response.status}.`,
        { status: response.status }
      );
    }

    const payload = validateHostPayload(await readJsonStrict(response, 'BioCLIP'));
    const top = payload.predictions[0];
    let proof = { exact: false, reason: thresholds ? 'below_calibrated_threshold' : 'thresholds_not_configured' };
    if (
      thresholds &&
      top.score >= thresholds.minSimilarity &&
      payload.topMargin >= thresholds.minMargin
    ) {
      proof = await verifyGbifSpecies(top, fetchImpl, controller.signal);
    }

    return {
      schemaVersion: CONTRACT_VERSION,
      provider: 'bioclip-2',
      model: MODEL_ID,
      modelRevision: payload.modelRevision,
      taxonomy: {
        source: TAXONOMY_SOURCE,
        version: payload.taxonomyVersion,
        taxonGroup: 'Aves',
      },
      scoreType: SCORE_TYPE,
      prediction: top,
      alternatives: payload.predictions.slice(1),
      topMargin: payload.topMargin,
      thresholds,
      identityEvidence: {
        exact: proof.exact === true,
        source: proof.exact ? EXACT_EVIDENCE_SOURCE : null,
        reason: proof.exact ? null : proof.reason,
        gbifKey: proof.exact ? proof.gbifKey : null,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  BioClipBirdError,
  CONTRACT_VERSION,
  EXACT_EVIDENCE_SOURCE,
  MAX_IMAGES,
  MODEL_ID,
  SCORE_TYPE,
  TAXONOMY_SOURCE,
  bioclipBirdIdentify,
  collectImages,
  isBioClipConfigured,
  readThresholds,
  validateEndpoint,
  validateHostPayload,
};
