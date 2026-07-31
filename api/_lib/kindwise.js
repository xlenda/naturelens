// Every language code Kindwise's identification APIs accept for the `language`
// query param (confirmed against their docs, not guessed) - keep this in sync
// with the client's SUPPORTED_LANGUAGES in i18n.js, or translated free-text
// fields (description/symptoms/treatment) silently fall back to English.
const SUPPORTED_LANGUAGES = ['en', 'de', 'cs', 'es', 'fr', 'it', 'nl', 'pl', 'sv', 'zh', 'zh-hant', 'da', 'tr', 'hi', 'ar', 'pt', 'ko'];

// Vercel caps a serverless request body at 4.5MB. The client already resizes
// each photo to 1280px wide (~250-450KB base64), so three fit comfortably -
// this ceiling is the guard against a caller sending ten full-size ones.
const MAX_IMAGES = 3;

// Validates the optional location fields, dropping anything the vendor would
// reject. A malformed value must never turn a good photo into a failed scan.
//
// The datetime shape is not negotiable and was established against the live API:
//   "2026-07-30T17:52:58"   accepted
//   "2026-07-30T17:52:58Z"  400 "Datetime ... is not in ISO format"
//   1785433978              400 "Datetime ... is not a string"
function coerceLocation({ latitude, longitude, datetime }) {
  const out = {};

  const lat = Number(latitude);
  const lon = Number(longitude);
  // Both or neither: a latitude without a longitude is not a place.
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    // 0,0 is Null Island - the Atlantic. It is what a broken geolocation stack
    // returns, never where someone is photographing a plant.
    !(lat === 0 && lon === 0)
  ) {
    out.latitude = lat;
    out.longitude = lon;
  }

  if (typeof datetime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(datetime)) {
    out.datetime = datetime;
  }

  return out;
}

async function kindwiseIdentify({
  res,
  host,
  apiKeyEnv,
  details,
  image,
  images,
  language,
  latitude,
  longitude,
  datetime,
}) {
  const apiKey = process.env[apiKeyEnv]?.trim();
  if (!apiKey) {
    res.status(500).json({ error: `${apiKeyEnv} not configured on the server` });
    return null;
  }

  // Kindwise accepts an ARRAY of photos of the same specimen and uses all of
  // them for one identification - more angles means materially better accuracy
  // (a leaf close-up plus the whole plant beats either alone). The endpoint was
  // always sending a one-element array; this just lets the client fill it.
  //
  // `image` (singular) stays supported so an older cached bundle keeps working.
  const list = Array.isArray(images) && images.length > 0 ? images : image ? [image] : [];
  const valid = list.filter((i) => typeof i === 'string' && i).slice(0, MAX_IMAGES);

  if (valid.length === 0) {
    res.status(400).json({ error: 'Missing "image" (base64) in request body' });
    return null;
  }

  const lang = SUPPORTED_LANGUAGES.includes(language) ? language : 'en';
  const dataUris = valid.map((i) => (i.startsWith('data:') ? i : `data:image/jpeg;base64,${i}`));

  let upstream;
  try {
    upstream = await fetch(`${host}/identification?details=${details}&language=${lang}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': apiKey,
      },
      body: JSON.stringify({
        images: dataUris,
        similar_images: true,
        // Where and when, when the app was able to get it. Kindwise weights the
        // answer by species range and season - verified live: it echoes the
        // values back in `input.latitude` / `input.datetime`.
        //
        // Spread rather than set: sending `latitude: null` is not the same as
        // omitting the field, and the vendor rejects malformed values outright
        // (a 400 for the whole identification). Anything that does not validate
        // is simply left out, so a bad coordinate can never cost a user their
        // scan. See coerceLocation.
        ...coerceLocation({ latitude, longitude, datetime }),
      }),
    });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the identification service.' });
    return null;
  }

  const rawBody = await upstream.text();
  let data = {};
  try {
    data = JSON.parse(rawBody);
  } catch {
    data = {};
  }

  if (!upstream.ok) {
    // The vendor's own message NEVER reaches the user.
    //
    // It used to be forwarded verbatim, and on 2026-07-30 that meant every
    // person trying to identify a plant - the app's flagship category - was
    // shown "The specified api key does not have sufficient number of available
    // credits.", in English, in all 17 languages. That sentence tells the user
    // nothing they can act on, blames a system they have no relationship with,
    // and leaks the account's internal state to anyone who points a script at
    // the endpoint.
    //
    // It is logged in full instead, because the OWNER is the one who has to act
    // on it, and shown to the user as a temporary problem - which, from their
    // side, is exactly what it is.
    console.error(
      `kindwise: ${apiKeyEnv} upstream ${upstream.status}:`,
      (data?.message || rawBody || '').slice(0, 300)
    );

    // 402 is the app's established "you have run out" signal and would raise the
    // paywall - completely wrong here, since it is the owner's credit that ran
    // out, not the user's free quota. Anything the user cannot fix is reported
    // as a service problem so the client shows a retry, not an upsell.
    const outOfCredits =
      upstream.status === 429 || /credit/i.test(String(data?.message || rawBody || ''));

    res.status(outOfCredits ? 503 : 502).json({
      error: 'This identification service is temporarily unavailable. Please try again shortly.',
      // Lets the client pick a message that matches the situation without
      // parsing prose. See components/identify.js.
      reason: outOfCredits ? 'serviceUnavailable' : 'vendorError',
    });
    return null;
  }

  return data;
}

function requireMethod(req, res, method) {
  if (req.method !== method) {
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  return true;
}

module.exports = { kindwiseIdentify, requireMethod };
