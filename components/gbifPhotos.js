import AsyncStorage from '@react-native-async-storage/async-storage';
import { GBIF_UA, getTaxonKey } from './gbifTaxonKey';

const CACHE_PREFIX = '@naturelens_gbif_photos_';
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const QUERY_LIMIT = 18;
const MAX_PHOTOS = 6;
const inflight = new Map();

function httpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
}

function hasExactSpeciesName(value) {
  const clean = typeof value === 'string' ? value.trim() : '';
  // A consulta por genero inclui todas as especies filhas. Exigir binomio (ou
  // hibrido binomial) impede uma galeria bonita, mas biologicamente errada.
  return /^[A-Z][A-Za-z.-]+\s+(?:(?:x|×)\s+)?[a-z][A-Za-z.-]+/.test(clean);
}

export function isCommercialImageLicense(value) {
  const license = String(value || '').trim().toLowerCase();
  return (
    /creativecommons\.org\/publicdomain\/(?:zero|mark)\//.test(license) ||
    /creativecommons\.org\/licenses\/by(?:-sa)?\//.test(license) ||
    /^cc0(?:\s+\d(?:\.\d+)?)?$/.test(license) ||
    /^cc by(?:-sa)?(?:\s+\d(?:\.\d+)?)?$/.test(license)
  );
}

function licenseName(value) {
  const license = String(value || '').toLowerCase();
  if (license.includes('/publicdomain/zero/')) return 'CC0';
  if (license.includes('/publicdomain/mark/')) return 'Public domain';
  if (license.includes('/licenses/by-sa/')) return 'CC BY-SA';
  if (license.includes('/licenses/by/')) return 'CC BY';
  return String(value || '').trim() || null;
}

function photoCredit(media, occurrence) {
  const parts = [
    media?.creator || occurrence?.recordedBy,
    media?.publisher || occurrence?.datasetTitle,
    'GBIF',
  ].filter((part, index, values) => part && values.indexOf(part) === index);
  return parts.join(' · ');
}

export function mapOccurrencePhotos(results, limit = MAX_PHOTOS) {
  if (!Array.isArray(results)) return [];
  const photos = [];
  const urls = new Set();

  for (const occurrence of results) {
    if (occurrence?.occurrenceStatus === 'ABSENT') continue;
    const mediaList = Array.isArray(occurrence?.media) ? occurrence.media : [];
    // Uma foto por ocorrencia evita que dez angulos do mesmo individuo
    // ocupem a galeria inteira; o proximo registro traz diversidade real.
    const media = mediaList.find((item) => {
      const url = httpUrl(item?.identifier);
      return url && isCommercialImageLicense(item?.license) && !urls.has(url);
    });
    if (!media) continue;

    const url = httpUrl(media.identifier);
    urls.add(url);
    photos.push({
      url,
      full: url,
      similarity: null,
      citation: photoCredit(media, occurrence),
      sourceUrl:
        httpUrl(media.references) ||
        (occurrence?.key ? `https://www.gbif.org/occurrence/${occurrence.key}` : null),
      licenseName: licenseName(media.license),
      licenseUrl: httpUrl(media.license),
      kind: 'observation',
    });
    if (photos.length >= limit) break;
  }
  return photos;
}

function timeoutSignal(ms) {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(ms)
    : undefined;
}

async function query(taxonKey, license) {
  const params = [
    ['taxon_key', taxonKey],
    ['media_type', 'StillImage'],
    ['occurrence_status', 'PRESENT'],
    ['license', license],
    ['limit', QUERY_LIMIT],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&');
  const response = await fetch(`https://api.gbif.org/v1/occurrence/search?${params}`, {
    headers: { 'User-Agent': GBIF_UA },
    signal: timeoutSignal(8000),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
}

function interleave(first, second) {
  const rows = [];
  const length = Math.max(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    if (first[index]) rows.push(first[index]);
    if (second[index]) rows.push(second[index]);
  }
  return rows;
}

export async function getGbifPhotos(scientific, providedKey) {
  if (!hasExactSpeciesName(scientific)) return [];
  const taxonKey = await getTaxonKey(scientific, providedKey);
  if (!taxonKey) return [];
  const cacheKey = CACHE_PREFIX + taxonKey;

  try {
    const cached = JSON.parse((await AsyncStorage.getItem(cacheKey)) || 'null');
    if (
      cached &&
      Number.isFinite(cached.savedAt) &&
      Date.now() - cached.savedAt < CACHE_TTL_MS &&
      Array.isArray(cached.photos)
    ) {
      return cached.photos;
    }
  } catch (e) {
    // Cache corrompido ou storage indisponivel: a rede ainda pode responder.
  }

  if (inflight.has(cacheKey)) return inflight.get(cacheKey);
  const pending = (async () => {
    try {
      // Apenas licencas que permitem uso comercial entram. A busca geral do
      // GBIF e dominada por CC BY-NC, que nao pode alimentar este produto.
      const [cc0, ccBy] = await Promise.all([
        query(taxonKey, 'CC0_1_0'),
        query(taxonKey, 'CC_BY_4_0'),
      ]);
      const photos = mapOccurrencePhotos(interleave(cc0, ccBy));
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({ savedAt: Date.now(), photos })
      ).catch(() => {});
      return photos;
    } catch (e) {
      return [];
    } finally {
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, pending);
  return pending;
}
