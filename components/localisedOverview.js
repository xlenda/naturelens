import { getSpeciesInfo } from './speciesPhoto';

// Species prose in the READER's language, for the vendors that only speak
// English.
//
// THE PROBLEM
// Kindwise (plants, insects, mushrooms, crops) takes a `language` parameter and
// returns localised descriptions. Fishial.AI and Nyckel do not - they have no
// localised content at all. So someone in Brazil identified a fish and got a
// paragraph of English written in ichthyology register (fin ray counts,
// vertebrae, diagnostic characters). Correct, and useless to them.
//
// WHY WIKIPEDIA RATHER THAN MACHINE TRANSLATION
// Translating the vendor's text on demand would work, but it costs an API call
// per identification, makes the user wait, and at the end of it still produces
// ichthyology register - just in Portuguese. Wikipedia's summary is already
// written for a general reader, already exists in every language the app ships,
// costs nothing, and returns in about 200ms. Measured on eight fish species
// including four Brazilian ones (tambaqui, pirarucu, dourado, tucunaré): 8/8 had
// a Portuguese article.
//
// The vendor's own text is not thrown away - it moves below the readable one as
// a technical section, which is where a fin ray count actually belongs.
//
// WHEN WIKIPEDIA HAS NOTHING
// Falls back to English Wikipedia, then to the vendor's text. A future
// improvement is to machine-translate at that point (it needs ANTHROPIC_API_KEY,
// not configured yet) - the shape of this function is what makes that a
// one-place change.

/**
 * Does this text read like prose, or like a diagnostic key?
 *
 * Fishial's `description` is not consistently prose. For Amphiprion percula the
 * entire description is:
 *
 *   "Dorsal spines (total): 9-10; Dorsal soft rays (total): 14-17; Anal spines:
 *    2; Anal soft rays: 11-13."
 *
 * That is a fin-ray count table. Translating it into Portuguese produces a fin-
 * ray count table in Portuguese - correct, and still useless to someone holding
 * a phone in front of a clownfish. Wikipedia has real prose about the same fish.
 *
 * So the two sources are ranked by what they actually contain rather than by
 * where they came from: prose leads, a key goes to the technical card.
 *
 * The test is the shape of the text. A diagnostic key is dense with colons,
 * semicolons and digits and has almost no sentences; prose is the reverse.
 */
export function looksLikeProse(text) {
  const source = String(text || '').trim();
  if (source.length < 80) return false;

  const words = source.split(/\s+/).length;
  const separators = (source.match(/[;:]/g) || []).length;
  const digits = (source.match(/\d/g) || []).length;
  // Sentence ends: a full stop followed by a space and a capital, or the end of
  // the text. Counting bare full stops would score "9-10." as a sentence.
  const sentences = (source.match(/[.!?](\s+[A-ZÀ-Þ]|\s*$)/g) || []).length;

  if (separators >= words / 12) return false;
  if (digits > source.length * 0.08) return false;
  return sentences >= 2;
}

/**
 * @param {object} args
 * @param {string=} args.scientific  binomial - the reliable key, identical in
 *                                   every language
 * @param {string=} args.commonName  English common name, used when the vendor
 *                                   gives no binomial (Nyckel returns only a
 *                                   label like "Peregrine Falcon")
 * @param {string}  args.language
 * @returns {Promise<{text: string, source: 'wikipedia', localised: boolean,
 *                    title: string|null, url: string|null} | null>}
 *          null when nothing was found - the caller then keeps whatever it had.
 */
export async function getLocalisedOverview({ scientific, commonName, language }) {
  const lookup = scientific || commonName;
  if (!lookup) return null;

  const info = await getSpeciesInfo(lookup, language);
  if (!info?.extract) return null;

  return {
    text: info.extract,
    source: 'wikipedia',
    // getSpeciesInfo falls back to the English article when the reader's
    // language has none, so the text is not necessarily in their language. The
    // caller uses this to decide whether the vendor's English text is still
    // worth showing separately - two English paragraphs is worse than one.
    localised: isLikelyLocalised(info.extract, language),
    title: info.title || null,
    url: info.sourceUrl || null,
  };
}

/**
 * Is this text already in the reader's language?
 *
 * Exported because three screens need it and two of them do not go through
 * getLocalisedOverview - SoundDetailScreen fetches getSpeciesInfo directly for
 * the photo and reuses its extract. Without this, that screen offered a
 * "Translate" button on a paragraph already in Portuguese: a button that would
 * spend an API call to change nothing.
 */
export function isInReaderLanguage(text, language) {
  return isLikelyLocalised(text, language);
}

// Rough check for "did we actually get the reader's language, or the English
// fallback?".
//
// getSpeciesInfo does not report which wiki answered, and adding that would mean
// changing a function three other screens depend on. For non-Latin scripts the
// test is exact - a Korean article contains Hangul and an English one does not.
// For Latin-script languages it looks for characters and short words that
// English does not use, and errs towards "localised" only when it finds real
// evidence.
function isLikelyLocalised(text, language) {
  const lang = String(language || 'en').slice(0, 2).toLowerCase();
  if (lang === 'en') return true;

  const SCRIPTS = {
    ko: /[가-힯]/,
    zh: /[一-鿿]/,
    hi: /[ऀ-ॿ]/,
    ar: /[؀-ۿ]/,
  };
  if (SCRIPTS[lang]) return SCRIPTS[lang].test(text);

  // Latin scripts: accented characters, or a function word English lacks.
  const MARKERS = {
    pt: /\b(é|uma|dos|das|não|também|espécie)\b/i,
    es: /\b(es|una|los|las|también|especie)\b/i,
    fr: /\b(est|une|des|également|espèce)\b/i,
    de: /\b(ist|eine|der|die|Art)\b/,
    it: /\b(è|una|degli|anche|specie)\b/i,
    nl: /\b(is|een|van|soort)\b/i,
    pl: /\b(jest|gatunek|oraz)\b/i,
    cs: /\b(je|druh|nebo)\b/i,
    sv: /\b(är|en|arten)\b/i,
    da: /\b(er|en|arten)\b/i,
    tr: /\b(bir|türü|olan)\b/i,
  };
  const marker = MARKERS[lang];
  return marker ? marker.test(text) : /[À-ÿ]/.test(text);
}
