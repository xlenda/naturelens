// Kindwise's ?language= localizes the species DESCRIPTION and common names,
// but every care field - toxicity, best watering/light/soil, common uses,
// cultural significance, edible parts, propagation, crop disease text - comes
// back ENGLISH-ONLY. The owner hit it live: UI in Portuguese, result half in
// English. This translates that batch server-side, in ONE Haiku call per
// identification, before the entity leaves the API.
//
// Doctrine line: translating vendor text is the already-approved mechanism
// (api/translate.js / the Translate button); it never INVENTS species facts -
// names, scientific names, ids and numbers are never sent to the model.
//
// Any failure - no key, timeout, malformed reply - returns the entity
// untouched: English beats an error, and the client renders either way.

const MODEL = 'claude-haiku-4-5-20251001';

const LANGUAGE_NAMES = {
  pt: 'Brazilian Portuguese', es: 'Spanish', de: 'German', fr: 'French',
  it: 'Italian', nl: 'Dutch', pl: 'Polish', cs: 'Czech', sv: 'Swedish',
  da: 'Danish', tr: 'Turkish', hi: 'Hindi', ar: 'Arabic', ko: 'Korean',
  zh: 'Simplified Chinese', 'zh-hant': 'Traditional Chinese',
};

// Only these top-level keys are eligible - identity fields (name, scientific,
// id, url, confidence, alternatives, similarImages) must never reach the
// model. Nested arrays/objects under an eligible key are walked recursively.
const ELIGIBLE_KEYS = [
  'origin',
  'toxicity',
  'bestWatering',
  'bestLightCondition',
  'bestSoilType',
  'commonUses',
  'culturalSignificance',
  'edibleParts',
  'propagationMethods',
  'disease',
];

// Collects every translatable string under the eligible keys as {text, set}
// pairs, so the reply can be written back exactly where each string came from.
function collect(entity) {
  const items = [];
  const visit = (container, key) => {
    const v = container[key];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length >= 3) {
        items.push({
          text: t,
          set: (val) => {
            container[key] = val;
          },
        });
      }
    } else if (Array.isArray(v)) {
      v.forEach((_, i) => visit(v, i));
    } else if (v && typeof v === 'object') {
      Object.keys(v).forEach((k) => visit(v, k));
    }
  };

  for (const topKey of ELIGIBLE_KEYS) {
    if (entity[topKey] == null) continue;
    visit(entity, topKey);
  }

  // `water` is special: its raw English value ("Medium", "Low (prefers dry
  // soil)") doubles as the KEY of the watering-interval map on the client
  // (components/watering.js) - translating it in place would silently kill
  // the watering feature. The translation goes to `waterLabel` for display
  // and the original stays as data.
  if (typeof entity.water === 'string' && entity.water.trim().length >= 3) {
    items.push({
      text: entity.water.trim(),
      set: (val) => {
        entity.waterLabel = val;
      },
    });
  }

  return items;
}

async function translateEntity(entity, language) {
  const langName = LANGUAGE_NAMES[language];
  if (!entity || !langName) return entity; // 'en' or unknown code: nothing to do

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return entity;

  const items = collect(entity);
  if (items.length === 0) return entity;

  const strings = {};
  items.forEach((item, i) => {
    strings[String(i + 1)] = item.text;
  });

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
        max_tokens: 2000,
        system:
          `You translate app content about plants and animals from English to ${langName}. ` +
          'Input is a JSON object of numbered strings. Reply with ONLY a JSON object with the ' +
          'SAME keys, each value translated. Keep scientific names and measurements unchanged, ' +
          'and use the standard local names for countries and regions. No commentary, no fences.\n' +
          // Safety fidelity is not optional here: these strings include the
          // toxicity warning shown on mushroom and plant results. A softened
          // translation ("mildly toxic" -> "safe in small amounts") is how a
          // translation layer sends someone to hospital.
          'SAFETY: translate warnings about toxicity, poisoning, irritation or danger with FULL ' +
          'force - never soften, hedge, shorten or omit them. Keep every hazard, symptom and ' +
          '"do not eat / keep away from children and pets" instruction explicit. If a sentence ' +
          'warns, the translation must warn just as strongly.',
        messages: [{ role: 'user', content: JSON.stringify(strings) }],
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!upstream.ok) return entity;
    const data = await upstream.json();
    const text = data?.content?.[0]?.text || '';
    const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const translated = JSON.parse(jsonText);
    items.forEach((item, i) => {
      const val = translated[String(i + 1)];
      if (typeof val === 'string' && val.trim()) item.set(val.trim());
    });
  } catch (e) {
    // timeout / parse / network: the English original ships, which is exactly
    // what the app did before this existed.
  }
  return entity;
}

module.exports = { translateEntity };
