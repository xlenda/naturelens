// Translates vendor text into the reader's language at identification time.
//
// WHY THIS EXISTS
// Kindwise takes a `language` parameter and answers in it. Fishial.AI and Nyckel
// do not - they have no localised content at all. So a user in Brazil identified
// a fish and got a paragraph of English. Lenda reported it plainly: "estando no
// Brasil e saiu tudo em inglês".
//
// WHY A LIBRARY AND NOT AN ENDPOINT
// Vercel's Hobby plan caps a deployment at 12 Serverless Functions and each file
// under api/ (outside _lib/) counts as one. The project sits at 8. Spending a
// slot on a translation endpoint would also mean a second round trip from the
// phone; doing it inside the identification response costs nothing extra in
// latency the user has not already accepted.
//
// WHAT IT DELIBERATELY DOES NOT DO
// It never WRITES content, only translates content the vendor supplied. Asking a
// model to describe a species from its own knowledge would produce confident
// text about range, edibility and toxicity that nobody verified - in an app
// where someone may be holding the mushroom. If the vendor said nothing, this
// returns null and the caller falls back to Wikipedia, which at least has an
// editor behind it.

const MODEL = 'claude-haiku-4-5-20251001';

// Enough for a long species description; beyond this the vendor is not sending
// prose any more.
const MAX_TOKENS = 900;
const MAX_INPUT_CHARS = 4000;

const LANGUAGE_NAMES = {
  en: 'English',
  pt: 'Brazilian Portuguese',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  cs: 'Czech',
  sv: 'Swedish',
  da: 'Danish',
  tr: 'Turkish',
  hi: 'Hindi',
  ar: 'Arabic',
  ko: 'Korean',
  zh: 'Simplified Chinese',
  'zh-hant': 'Traditional Chinese',
};

// Vendor placeholders. Translating these produces "Nenhuma descrição
// disponível" - technically correct and completely worthless, and it would stop
// the caller from falling back to something that actually says something.
const PLACEHOLDER = /^\s*no description available/i;

/**
 * Does this text read like prose, or like a diagnostic key?
 *
 * MUST STAY IDENTICAL to looksLikeProse in components/localisedOverview.js -
 * the server uses it to decide whether translating is worth paying for, the
 * client uses it to decide which text leads. If they disagree, the app either
 * pays for a translation it hides, or leads with a fin-ray table it never
 * translated. There is a test asserting the two copies match, because a
 * heuristic needed on both sides of the CommonJS/ESM boundary cannot be shared
 * any other way in this project.
 *
 * Fishial's description for Amphiprion percula is, in full:
 *   "Dorsal spines (total): 9-10; Dorsal soft rays (total): 14-17; ..."
 * A diagnostic key is dense with colons, semicolons and digits and has almost no
 * sentences; prose is the reverse.
 */
function looksLikeProse(text) {
  const source = String(text || '').trim();
  if (source.length < 80) return false;

  const words = source.split(/\s+/).length;
  const separators = (source.match(/[;:]/g) || []).length;
  const digits = (source.match(/\d/g) || []).length;
  const sentences = (source.match(/[.!?](\s+[A-ZÀ-Þ]|\s*$)/g) || []).length;

  if (separators >= words / 12) return false;
  if (digits > source.length * 0.08) return false;
  return sentences >= 2;
}

function normaliseLanguage(code) {
  const raw = String(code || 'en').toLowerCase();
  if (LANGUAGE_NAMES[raw]) return raw;
  const short = raw.slice(0, 2);
  return LANGUAGE_NAMES[short] ? short : 'en';
}

/**
 * @returns the translated text, or null when there was nothing worth
 *          translating, no API key configured, or the call failed. Never throws:
 *          a translation problem must never cost the user their identification,
 *          which they have already paid a scan for.
 */
async function translateVendorText(text, language) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const source = typeof text === 'string' ? text.trim() : '';
  if (!source || PLACEHOLDER.test(source)) return null;

  const lang = normaliseLanguage(language);
  // Already in the target language - the vendor is English-only, so this only
  // catches an English reader, but that is the commonest single case.
  if (lang === 'en') return null;

  const target = LANGUAGE_NAMES[lang];

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system:
          `Translate the user's text into ${target}.\n\n` +
          'It is a species description from a wildlife identification database, ' +
          'written in technical register.\n\n' +
          'Rules:\n' +
          `- Reply with the ${target} translation and nothing else. No preamble, ` +
          'no notes, no quotation marks around it.\n' +
          '- Keep scientific names in Latin, unchanged.\n' +
          '- Keep every number, measurement and count exactly as given. These are ' +
          'diagnostic characters; changing one makes the description describe a ' +
          'different animal.\n' +
          '- Where a technical term has an everyday equivalent a general reader ' +
          'would know, use it. This is read by people holding a phone, not by ' +
          'ichthyologists.\n' +
          '- Translate only. Never add a fact that is not in the source, and never ' +
          'remove one.\n' +
          // A MESMA regra do api/_lib/translateEntity.js, palavra por palavra.
          // Ela morava so la, e este e o tradutor do peixe e do botao
          // "Traduzir" - o mesmo modelo, o mesmo texto de risco, sem a trava.
          // Um peixe peconhento ou uma isca toxica descritos aqui saiam sujeitos
          // ao encurtamento que a outra rota proibe.
          'SAFETY: translate warnings about toxicity, poisoning, irritation or danger with FULL ' +
          'force - never soften, hedge, shorten or omit them. Keep every hazard, symptom and ' +
          '"do not eat / keep away from children and pets" instruction explicit. If a sentence ' +
          'warns, the translation must warn just as strongly.',
        messages: [{ role: 'user', content: source.slice(0, MAX_INPUT_CHARS) }],
      }),
      // Deliberately short. This runs inside the identification response, so a
      // slow translation delays a result the user is already waiting for -
      // better to ship the English and let the client fall back.
      signal: AbortSignal.timeout(12000),
    });

    if (!upstream.ok) {
      console.error('translate: upstream failed', upstream.status);
      return null;
    }

    const data = await upstream.json();
    const out = (data?.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    return out || null;
  } catch (e) {
    console.error('translate: request failed', e.message);
    return null;
  }
}

module.exports = { translateVendorText, looksLikeProse, normaliseLanguage, LANGUAGE_NAMES };
