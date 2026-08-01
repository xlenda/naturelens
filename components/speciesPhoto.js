// Real photographs for field-guide species, from Wikipedia's REST summary API.
//
// Why this source: the Discover collections and Nyckel bird results had NO
// photo at all - a field-guide entry that describes a scarlet macaw without
// showing one is half a page. Wikipedia's summary endpoint is keyed by
// SCIENTIFIC NAME, which is the one identifier that is identical in all 17
// languages, so the same lookup works everywhere without translating anything.
//
// It is also honest about provenance: the images are Wikimedia Commons content,
// so the caller gets the attribution URL along with the thumbnail and links to
// it. Never present a third party's photo as ours.
//
// No API key, no rate limit that matters at this volume, and the whole thing
// degrades to null - a missing photo hides the block instead of breaking it.

const cache = new Map();

// App locale -> the Wikipedia subdomain that actually serves it.
//
// `zh-hant` is a locale this app SHIPS, and it has no wikipedia.org subdomain of
// that name: Traditional Chinese lives at zh-yue/zh-tw variants of zh, and the
// closest usable host is zh.wikipedia.org. A two-letter regex silently rejected
// the whole code and served English, so every Traditional Chinese reader got
// English species text and English photo captions - one of the seventeen
// languages simply did not work.
const WIKI_HOSTS = {
  'zh-hant': 'zh',
};

function endpoint(scientificName, language) {
  // Wikipedia wants underscores. A binomial is two words, but this is also
  // called with a COMMON name for Nyckel bird results, which have no scientific
  // name at all - "Peregrine Falcon" is two words, "Great Blue Heron" is three.
  // Truncating to two turned that into "Great Blue", which finds nothing.
  //
  // So: strip an author citation, then keep two words only when the input looks
  // like a binomial (exactly two words, second one lower-case, as Latin
  // epithets always are). Anything else is passed through whole.
  const bare = String(scientificName).split('(')[0].trim();
  const words = bare.split(/\s+/);
  const isBinomial = words.length === 2 && /^[a-zà-ÿ]/.test(words[1] || '');
  const clean = (isBinomial ? words.slice(0, 2) : words).join('_');

  // Try the user's own language Wikipedia first (its caption and article are in
  // their language), then fall back to English, which has the widest species
  // coverage by far.
  const raw = String(language || 'en').toLowerCase();
  const mapped = WIKI_HOSTS[raw] || raw;
  const lang = /^[a-z]{2,3}$/.test(mapped) ? mapped : 'en';
  return {
    lang,
    binomial: clean.replace(/_/g, ' '),
    primary: summaryUrl(lang, clean),
    fallback: summaryUrl('en', clean),
  };
}

function summaryUrl(lang, title) {
  return `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    String(title).replace(/ /g, '_')
  )}`;
}

// Wikipedia asks every client to identify itself, and rate-limits anonymous
// bursts hard (verified: eight rapid calls without one got "You are making too
// many requests to the API").
const WIKI_HEADERS = {
  Accept: 'application/json',
  'Api-User-Agent': 'NatureLens/1.0 (https://naturelensapp.cloud)',
};

function timeoutSignal(ms) {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(ms)
    : undefined;
}

/**
 * The title of an article in another language, via Wikipedia's own langlinks.
 *
 * This exists because scientific names are NOT how most Wikipedias title their
 * species articles. Portuguese Wikipedia has no page called "Piaractus
 * brachypomus" - the same fish is filed under "Pirapitinga". A direct lookup
 * 404s and the reader gets the English article, which is exactly the complaint
 * that started this: a user in Brazil identifying a fish and getting English.
 *
 * langlinks is the curated, editor-maintained mapping between an article and
 * its equivalents, so this is exact rather than a search heuristic that might
 * land on the genus page.
 *
 * `redirects=1` is load-bearing: most binomials are redirects on English
 * Wikipedia, and without it the API answers about the redirect (which carries no
 * langlinks) instead of the article.
 */
async function localTitleFor(scientificName, language) {
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1' +
    `&titles=${encodeURIComponent(scientificName.replace(/ /g, '_'))}` +
    `&prop=langlinks&lllang=${encodeURIComponent(language)}`;
  const response = await fetch(url, { headers: WIKI_HEADERS, signal: timeoutSignal(8000) });
  if (!response.ok) return null;
  const data = await response.json();
  const page = Object.values(data?.query?.pages || {})[0];
  return page?.langlinks?.[0]?.['*'] || null;
}

async function fetchOne(url) {
  const response = await fetch(url, {
    headers: WIKI_HEADERS,
    signal: timeoutSignal(8000),
  });
  if (!response.ok) throw new Error(String(response.status));
  const data = await response.json();
  const thumb = data?.thumbnail?.source || null;
  return {
    // `originalimage` is full resolution; the thumbnail is what we display.
    url: thumb,
    full: data.originalimage?.source || thumb,
    width: data.thumbnail?.width || null,
    height: data.thumbnail?.height || null,
    // The page title IS the common name in whichever Wikipedia answered - so
    // "Falco peregrinus" comes back as "Falcão-peregrino" in pt and "송골매" in
    // ko, with no translation table to maintain.
    title: data.title || null,
    // Short "species of frog"-style line, and the opening paragraph of the
    // article. Both already in the user's language.
    description: data.description || null,
    extract: data.extract || null,
    // Where the picture came from, so the UI can credit it.
    sourceUrl: data.content_urls?.desktop?.page || null,
  };
}

/**
 * Everything Wikipedia knows about a species: common name, one-line description,
 * opening paragraph and photo - all in the user's language when available.
 *
 * @returns { url, full, title, description, extract, sourceUrl } or null.
 *          Any individual field may be null. Never throws.
 */
export async function getSpeciesInfo(scientificName, language = 'en') {
  if (!scientificName) return null;

  const key = `${language}:${scientificName}`;
  if (cache.has(key)) return cache.get(key);

  const { primary, fallback, lang, binomial } = endpoint(scientificName, language);

  const promise = (async () => {
    let local = await fetchOne(primary).catch(() => null);

    // Nothing under the scientific name in the reader's language? Ask Wikipedia
    // where that article actually lives. "Piaractus brachypomus" is filed as
    // "Pirapitinga" in Portuguese, and without this step the reader gets the
    // English article for a fish their language has a perfectly good page for.
    if (!local && primary !== fallback) {
      const localTitle = await localTitleFor(binomial, lang).catch(() => null);
      if (localTitle) {
        local = await fetchOne(summaryUrl(lang, localTitle)).catch(() => null);
      }
    }

    // The local-language article is preferred for TEXT, but smaller Wikipedias
    // often have the article without an image. In that case take the English
    // photo and keep the local prose - the alternative is choosing between a
    // page with no picture and a page in the wrong language.
    if (local && !local.url && primary !== fallback) {
      const en = await fetchOne(fallback).catch(() => null);
      if (en?.url) return { ...local, url: en.url, full: en.full, width: en.width, height: en.height };
      return local;
    }
    if (local) return local;
    if (primary === fallback) return null;
    return fetchOne(fallback).catch(() => null);
  })()
    // A negative result is cached too: without that, every screen focus retries
    // a species Wikipedia simply does not have.
    .catch(() => null);

  cache.set(key, promise);
  return promise;
}

/**
 * Photo only, or null when there is no image.
 *
 * Kept as its own function because every existing caller renders
 * `<Image source={{ uri: photo.url }} />` behind a plain `photo &&` check - an
 * object with a null url would show a broken image instead of hiding the block.
 *
 * @returns { url, full, sourceUrl, title } or null. Never throws.
 */
export async function getSpeciesPhoto(scientificName, language = 'en') {
  const info = await getSpeciesInfo(scientificName, language);
  return info?.url ? info : null;
}
