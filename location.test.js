// Guards on approximate location and on how vendor failures reach the user.
//
// Both exist because of things found live on 2026-07-30:
//   * plant and tree were returning the vendor's own sentence - "The specified
//     api key does not have sufficient number of available credits." - straight
//     to the user, in English, in all 17 languages, on the app's flagship
//     category;
//   * the Kindwise datetime format is not the obvious one, and getting it wrong
//     400s the whole identification rather than just ignoring the field.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { uiLocaleFiles } = require('./test-locales');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const kindwiseSrc = read('api/_lib/kindwise.js');
const locationSrc = read('components/deviceLocation.js');
const clientSrc = read('components/identify.js');

test("the vendor's own error text never reaches the user", () => {
  // Forwarding data.message meant showing "...api key does not have sufficient
  // number of available credits" to every person trying to identify a plant.
  assert.doesNotMatch(
    kindwiseSrc,
    /res\.status\(upstream\.status\)\.json\(\{ error: data\?\.message/,
    'the upstream message must be logged for the owner, not shown to the user'
  );
  assert.match(kindwiseSrc, /console\.error\(\s*`kindwise:/, 'the owner still needs the real reason');
  assert.match(
    kindwiseSrc,
    /reason: outOfCredits \? 'serviceUnavailable' : 'vendorError'/,
    'the client needs a machine-readable reason, not prose to parse'
  );
});

test('running out of credits does not raise the paywall', () => {
  // 402 is the app's "your free uses are gone" signal. Using it when the OWNER's
  // credit ran out would ask the user to pay for the owner's problem.
  const block = kindwiseSrc.slice(kindwiseSrc.indexOf('if (!upstream.ok)'), kindwiseSrc.indexOf('return data;'));
  // Comments stripped first: the block deliberately MENTIONS 402 to explain why
  // it is not used, and asserting on the raw text matched that explanation.
  const code = block.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /\b402\b/, 'an owner-side outage must never look like a quota wall');
  assert.match(code, /status\(outOfCredits \? 503 : 502\)/);
});

test('the client shows a translated message for a service outage', () => {
  assert.match(
    clientSrc,
    /reason === 'serviceUnavailable' \|\| data\?\.reason === 'vendorError'/,
  );
  assert.match(clientSrc, /identify\.serviceDownBody/);
});

test('every locale can explain an outage and the location setting', () => {
  const dir = path.join(__dirname, 'public/locales');
  const locales = uiLocaleFiles();
  assert.equal(locales.length, 17);
  for (const file of locales) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const [section, key] of [
      ['identify', 'serviceDownTitle'],
      ['identify', 'serviceDownBody'],
      ['profile', 'locationRow'],
      ['profile', 'locationHint'],
    ]) {
      assert.ok(
        typeof j[section]?.[key] === 'string' && j[section][key].trim(),
        `${file} is missing a non-empty ${section}.${key}`
      );
    }
  }
});

test('coordinates are rounded before they leave the device', () => {
  // Two decimal places is ~1.1 km: precise enough to place a specimen inside a
  // species range, and not precise enough to record which house someone was
  // standing outside. Precision nobody needs is precision nobody should collect.
  assert.match(locationSrc, /Math\.round\(coords\.latitude \* 100\) \/ 100/);
  assert.match(locationSrc, /Math\.round\(coords\.longitude \* 100\) \/ 100/);
});

test('location can never block or break an identification', () => {
  assert.match(locationSrc, /enableHighAccuracy: false/, 'the GPS chip is slow and pointless for a species range');
  assert.match(locationSrc, /setTimeout\(\(\) => done\(null\), TIMEOUT_MS \+ 500\)/,
    'some browsers ignore the timeout option and leave the callback pending forever');
  // A refusal must be remembered so the app does not prompt on every scan.
  assert.match(locationSrc, /error\.code === 1/);
  assert.match(locationSrc, /DENIED_KEY/);
});

test('the datetime format is the one the vendor actually accepts', () => {
  // Verified live: "2026-07-30T17:52:58" is accepted; the same value with a
  // trailing Z is rejected as "not in ISO format", and a Unix timestamp as
  // "not a string".
  assert.match(
    kindwiseSrc,
    /\^\\d\{4\}-\\d\{2\}-\\d\{2\}T\\d\{2\}:\\d\{2\}:\\d\{2\}\$/,
    'the server must reject any datetime shape the vendor would 400 on'
  );
  assert.doesNotMatch(locationSrc, /toISOString/, 'toISOString produces the Z form the vendor rejects');
});

test('a malformed coordinate is dropped, not forwarded', () => {
  const fn = kindwiseSrc.slice(kindwiseSrc.indexOf('function coerceLocation'), kindwiseSrc.indexOf('async function kindwiseIdentify'));
  assert.match(fn, /Math\.abs\(lat\) <= 90/);
  assert.match(fn, /Math\.abs\(lon\) <= 180/);
  // 0,0 is in the Atlantic - it is what a broken geolocation stack returns,
  // never where someone photographs a plant.
  assert.match(fn, /lat === 0 && lon === 0/);
  assert.match(fn, /Number\.isFinite/);
});

test('Permissions-Policy allows geolocation now that it is used', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const header = vercel.headers
    .flatMap((h) => h.headers || [])
    .find((h) => h.key === 'Permissions-Policy');
  assert.doesNotMatch(
    header.value,
    /geolocation\s*=\s*\(\s*\)/,
    'an empty allowlist denies geolocation to this site, exactly as microphone=() did'
  );
  assert.match(header.value, /geolocation\s*=\s*\(\s*self\s*\)/);
});

test('a diagnostic key never leads over readable prose', () => {
  // Fishial's description for Amphiprion percula is, in full:
  //   "Dorsal spines (total): 9-10; Dorsal soft rays (total): 14-17; ..."
  // Translating that into Portuguese produces a fin-ray table in Portuguese.
  // Correct, and useless to someone holding a phone in front of a clownfish.
  const src = read('components/localisedOverview.js');
  const start = src.indexOf('export function looksLikeProse');
  const fn = src.slice(start, src.indexOf('\n}', start) + 2).replace('export ', '');
  // eslint-disable-next-line no-eval
  const looksLikeProse = eval(`(${fn})`);

  assert.equal(
    looksLikeProse(
      'Dorsal spines (total): 9-10; Dorsal soft rays (total): 14-17; Anal spines: 2; Anal soft rays: 11-13.'
    ),
    false,
    'a fin-ray count table must not be treated as a description'
  );
  assert.equal(
    looksLikeProse(
      'This species inhabits coral reefs and lagoons in the Indo-Pacific. It forms a ' +
        'symbiotic relationship with sea anemones, which protect it from predators. ' +
        'Adults reach about 11 cm in length.'
    ),
    true
  );
  // Too short to judge - treated as not-prose so the richer source wins.
  assert.equal(looksLikeProse('Peixe pequeno.'), false);
  assert.equal(looksLikeProse(null), false);
});

test('translation never invents content and never blocks a result', () => {
  const src = read('api/_lib/translate.js');
  // Placeholders must not be translated - "Nenhuma descrição disponível" would
  // stop the caller falling back to Wikipedia, which actually says something.
  assert.match(src, /const PLACEHOLDER = .*no description available/i);
  assert.match(src, /PLACEHOLDER\.test\(source\)[\s\S]{0,20}return null/);
  // No key configured must degrade to English, not to an error.
  assert.match(src, /if \(!apiKey\) return null/);
  // Bounded: this runs inside a response the user is already waiting for.
  assert.match(src, /AbortSignal\.timeout\(12000\)/);
  // It translates; it must never be asked to write. A model describing a
  // mushroom from its own knowledge is a safety problem, not a feature.
  assert.match(src, /Translate only\. Never add a fact/);
});

test('the prose detector is identical on both sides of the boundary', () => {
  // The server uses looksLikeProse to decide whether translating is worth
  // paying for; the client uses it to decide which text leads. If the two copies
  // drift, the app either pays for a translation it then hides, or leads with a
  // fin-ray table it never translated.
  //
  // They cannot be shared: api/ is CommonJS and runs on Vercel, components/ is
  // ESM and rides in the Expo bundle. So they are duplicated deliberately, and
  // this test is the thing that keeps them honest.
  const extract = (source) => {
    const start = source.indexOf('function looksLikeProse');
    return source
      .slice(start, source.indexOf('\n}', start) + 2)
      // Comments differ between the two files on purpose - only the code matters.
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const server = extract(read('api/_lib/translate.js'));
  const client = extract(read('components/localisedOverview.js'));

  assert.ok(server.length > 100, 'looksLikeProse not found in api/_lib/translate.js');
  assert.equal(
    client,
    server,
    'the two copies of looksLikeProse have drifted - update both or neither'
  );
});

test('on-demand translation is rate limited and needs a device', () => {
  // This is the only endpoint whose cost is driven by a button, so an
  // unauthenticated caller must not be able to loop it.
  const src = read('api/translate.js');
  assert.match(src, /scope: 'translate'/, 'must not share the identify rate-limit budget');
  assert.match(src, /requireDeviceId\(req, res\)/);
  assert.match(src, /text\.length > MAX_CHARS[\s\S]{0,80}status\(413\)/);
});

test('the fish handler only pays to translate text that will lead', () => {
  const src = read('api/identify.js');
  // Decided once, on the ENGLISH original, and sent to the client as
  // overviewIsProse. The client cannot re-derive it: by then the text may be a
  // Korean or Chinese translation, which the detector reads as "not prose".
  assert.match(src, /const vendorIsProse = looksLikeProse\(fa\.description\);/);
  assert.match(
    src,
    /vendorIsProse\s*\n?\s*\?\s*await translateVendorText/,
    'a diagnostic key lands in a card below the fold - translating it on every ' +
      'identification pays for text most people never scroll to'
  );
  assert.match(
    src,
    /overviewIsProse: vendorIsProse/,
    'the verdict must travel to the client, not be recomputed there'
  );

  const screen = read('screens/FishDetailScreen.js');
  assert.match(
    screen,
    /typeof plant\.overviewIsProse === 'boolean'/,
    'the screen must trust the server verdict when it has one'
  );
});

test('language detection never mistakes English for another language', () => {
  // The Dutch marker used to include "is", a word in both languages, so all
  // three of these English sentences were judged already-Dutch and the Translate
  // button disappeared for every Dutch reader. "en" was the same trap for
  // Swedish and Danish.
  const src = read('components/localisedOverview.js');
  const start = src.indexOf('function isLikelyLocalised');
  // eslint-disable-next-line no-eval
  const isLikelyLocalised = eval(`(${src.slice(start, src.indexOf('\n}', start) + 2)})`);

  const ENGLISH = [
    'The peregrine falcon is a bird of prey in the family Falconidae. It is renowned for its speed.',
    'This is a species of tree frog found across Europe. Adults are green and about 4 cm long.',
    'The clownfish is one of the most recognisable reef fish in the world. It lives among anemones.',
  ];
  for (const lang of ['pt', 'es', 'fr', 'de', 'it', 'nl', 'pl', 'cs', 'sv', 'da', 'tr']) {
    for (const text of ENGLISH) {
      assert.equal(
        isLikelyLocalised(text, lang),
        false,
        `English text judged as ${lang} - the Translate button would vanish`
      );
    }
  }

  // And real text in each language must still be recognised, or the button
  // appears on text that needs no translating.
  const NATIVE = {
    pt: 'Esta espécie habita recifes de coral no Indo-Pacífico. Forma relação simbiótica com anêmonas.',
    nl: 'Deze soort leeft in koraalriffen en lagunes. Het vormt een symbiotische relatie met zeeanemonen.',
    sv: 'Denna art lever i korallrev och laguner. Den bildar ett symbiotiskt förhållande med havsanemoner.',
    da: 'Denne art lever i koralrev og laguner, og den danner et symbiotisk forhold med søanemoner.',
    de: 'Diese Art lebt in Korallenriffen. Sie bildet eine symbiotische Beziehung mit Seeanemonen.',
  };
  for (const [lang, text] of Object.entries(NATIVE)) {
    assert.equal(isLikelyLocalised(text, lang), true, `${lang} text not recognised as ${lang}`);
  }
});

test('the privacy policy discloses that location leaves the device', () => {
  // Location was added and shipped default-ON without the policy saying so. It
  // goes to a third party (Kindwise), which is exactly what a privacy policy is
  // for.
  const screen = read('screens/PrivacyScreen.js');
  assert.match(screen, /privacy\.locationTitle/);
  assert.match(screen, /privacy\.locationBody/);

  const dir = path.join(__dirname, 'public/locales');
  const locales = uiLocaleFiles();
  for (const file of locales) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const key of ['locationTitle', 'locationBody']) {
      assert.ok(
        typeof j.privacy?.[key] === 'string' && j.privacy[key].trim(),
        `${file} is missing a non-empty privacy.${key}`
      );
    }
  }
});

test('every locale can label the translate button', () => {
  const dir = path.join(__dirname, 'public/locales');
  const locales = uiLocaleFiles();
  for (const file of locales) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const key of ['translate', 'translating', 'translateFailed']) {
      assert.ok(
        typeof j.common?.[key] === 'string' && j.common[key].trim(),
        `${file} is missing a non-empty common.${key}`
      );
    }
  }
});
