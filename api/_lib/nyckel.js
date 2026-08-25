// Nyckel (nyckel.com) - bird identification via their pretrained "Bird
// Identifier" classifier (291 labels, trained on a 525-species dataset).
//
// Kindwise has no bird product (confirmed against their catalogue), so this is
// the one category in the app backed by a different vendor than plant/insect/
// mushroom/crop/tree.
//
// Auth is OAuth2 client_credentials (NOT the flat Api-Key header Kindwise
// uses): POST /connect/token with client id+secret -> a Bearer token valid for
// one hour. Verified live 2026-07-28 with real credentials.
//
// Invoke body shape `{ data: <dataUri> }` VERIFIED LIVE 2026-07-28 against the
// cloned function (function_9coz8spa4itrqmil): HTTP 200 with
// { labelName, labelId, confidence }. The category stays gated on
// NYCKEL_BIRD_FUNCTION_ID so a missing env var degrades to "unknown category"
// instead of a tab that always errors.
const TOKEN_URL = 'https://www.nyckel.com/connect/token';
const API_BASE = 'https://www.nyckel.com/v1';

// Token lives one hour; refresh at 55 minutes so an in-flight call never races
// the expiry. Cached per warm serverless container, same as fishial.js.
const TOKEN_TTL_MS = 55 * 60 * 1000;
let cachedToken = null;
let cachedTokenAt = 0;

const STEP_TIMEOUT_MS = 20000;
function withTimeout(init = {}) {
  return { ...init, signal: AbortSignal.timeout(STEP_TIMEOUT_MS) };
}

// See fishial.js - a 401 on a supposedly fresh token must drop the cache or
// every request fails until the 55-minute window expires on its own.
function invalidateToken() {
  cachedToken = null;
  cachedTokenAt = 0;
}

async function getToken() {
  const now = Date.now();
  if (cachedToken && now - cachedTokenAt < TOKEN_TTL_MS) return cachedToken;

  const clientId = process.env.NYCKEL_CLIENT_ID?.trim();
  const clientSecret = process.env.NYCKEL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('NYCKEL_CLIENT_ID / NYCKEL_CLIENT_SECRET not configured on the server');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const resp = await fetch(TOKEN_URL, withTimeout({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }));

  if (!resp.ok) throw new Error(`Nyckel auth failed (${resp.status})`);

  const data = await resp.json();
  if (!data?.access_token) throw new Error('Nyckel auth returned no access_token');

  cachedToken = data.access_token;
  cachedTokenAt = now;
  return cachedToken;
}

async function nyckelIdentify({ res, image, images, functionId }) {
  // Nyckel invokes on a single input - same reasoning as fishial.js.
  if (Array.isArray(images) && images.length > 0) image = images[0];
  if (typeof image !== 'string' || !image) {
    res.status(400).json({ error: 'Missing "image" (base64) in request body' });
    return null;
  }
  if (!functionId) {
    res.status(500).json({ error: 'Bird identification is not configured on the server.' });
    return null;
  }

  let token;
  try {
    token = await getToken();
  } catch (err) {
    res.status(500).json({ error: 'Bird identification is not configured on the server.' });
    return null;
  }

  const dataUri = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;

  try {
    // O padrao do Nyckel e capturar cada invoke como amostra revisavel. Este
    // fluxo so precisa da resposta imediata, entao a foto nao deve alimentar
    // a fila de captura ou treino do fornecedor.
    const resp = await fetch(`${API_BASE}/functions/${functionId}/invoke?capture=false`, withTimeout({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: dataUri }),
    }));

    if (resp.status === 401) invalidateToken();

    const raw = await resp.text();
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }

    if (!resp.ok) {
      // Nyckel's free tier is 100 invokes/month - a 402/429 here most likely
      // means the monthly allowance is gone, which is a billing state the user
      // can't fix, not a bad photo. Keep it a generic failure rather than
      // blaming their picture.
      res.status(502).json({ error: 'Could not identify this photo. Please try again.' });
      return null;
    }

    return data;
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the identification service.' });
    return null;
  }
}

module.exports = { nyckelIdentify };
