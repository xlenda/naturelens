const crypto = require('crypto');

// Fishial.AI (fishial.ai) - fish identification. Unlike every Kindwise API
// already used here, this is NOT a single POST: it's a 4-step dance, verified
// live against the real API on 2026-07-28 before this was written.
//
//   1. POST api-users.fishial.ai/v1/auth/token  -> Bearer token (10 min TTL)
//   2. POST api.fishial.ai/v1/recognition/upload -> signed GCS URL + signed-id
//   3. PUT  <signed GCS URL> with the image bytes
//   4. GET  api.fishial.ai/v1/recognition/image?q=<signed-id> -> results
//
// Step 3 is the one that bites: the signed Google Cloud Storage URL is signed
// over an EXACT header set, so sending ANY header beyond the two the API hands
// back (Content-MD5, Content-Disposition) returns 403. `fetch` adds its own
// Content-Type when given a body, which is exactly what broke the first live
// test - that's why the PUT below builds its header object from the API's own
// `direct-upload.headers` and adds nothing of its own.
const AUTH_URL = 'https://api-users.fishial.ai/v1/auth/token';
const API_BASE = 'https://api.fishial.ai/v1';

// Per-step timeout. Without one, a hung vendor step held the serverless
// invocation open until Vercel's own kill (Fable review finding) - the user
// meanwhile stared at an endless spinner. 20s per step keeps the whole 4-step
// flow inside a sane budget while leaving room for a slow image upload.
const STEP_TIMEOUT_MS = 20000;

function withTimeout(init = {}) {
  // AbortSignal.timeout exists on Vercel's Node 18+ runtime.
  return { ...init, signal: AbortSignal.timeout(STEP_TIMEOUT_MS) };
}

// Drops the cached token. Called when the API answers 401 with a token that
// should still be valid by our clock - clock skew or a vendor-side revocation
// would otherwise wedge every request until the cache expired on its own.
function invalidateToken() {
  cachedToken = null;
  cachedTokenAt = 0;
}

// The token lives 10 minutes. Cache it per warm serverless container and
// refresh at 8 minutes so an in-flight request never races the expiry.
const TOKEN_TTL_MS = 8 * 60 * 1000;
let cachedToken = null;
let cachedTokenAt = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now - cachedTokenAt < TOKEN_TTL_MS) return cachedToken;

  const clientId = process.env.FISHIAL_API_KEY?.trim();
  const clientSecret = process.env.FISHIAL_API_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('FISHIAL_API_KEY / FISHIAL_API_SECRET not configured on the server');
  }

  const resp = await fetch(AUTH_URL, withTimeout({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  }));

  if (!resp.ok) {
    throw new Error(`Fishial auth failed (${resp.status})`);
  }

  const data = await resp.json();
  if (!data?.access_token) throw new Error('Fishial auth returned no access_token');

  cachedToken = data.access_token;
  cachedTokenAt = now;
  return cachedToken;
}

// The client sends the same base64 payload every other category uses (with or
// without a data: prefix) - Fishial needs raw bytes plus their exact size and
// MD5, so decode once here and derive all three from the same Buffer.
function decodeImage(image) {
  const base64 = image.startsWith('data:') ? image.slice(image.indexOf(',') + 1) : image;
  const buffer = Buffer.from(base64, 'base64');
  const checksum = crypto.createHash('md5').update(buffer).digest('base64');
  return { buffer, byteSize: buffer.length, checksum };
}

async function fishialIdentify({ res, image, images }) {
  // Fishial's recognition endpoint takes exactly one uploaded blob, so extra
  // angles cannot be forwarded - use the first and ignore the rest rather than
  // failing a request the user thought would work.
  if (Array.isArray(images) && images.length > 0) image = images[0];
  if (typeof image !== 'string' || !image) {
    res.status(400).json({ error: 'Missing "image" (base64) in request body' });
    return null;
  }

  let token;
  try {
    token = await getToken();
  } catch (err) {
    res.status(500).json({ error: 'Fish identification is not configured on the server.' });
    return null;
  }

  const { buffer, byteSize, checksum } = decodeImage(image);

  // Step 2 - ask for a signed upload URL.
  let uploadInfo;
  try {
    const uploadResp = await fetch(`${API_BASE}/recognition/upload`, withTimeout({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        blob: {
          filename: 'scan.jpg',
          content_type: 'image/jpeg',
          byte_size: byteSize,
          checksum,
        },
      }),
    }));
    // A 401 on a token we still considered fresh means the vendor revoked it -
    // drop the cache so the NEXT request re-authenticates instead of failing
    // for the rest of this container's life (Fable review finding).
    if (uploadResp.status === 401) invalidateToken();
    if (!uploadResp.ok) throw new Error(`upload handshake ${uploadResp.status}`);
    uploadInfo = await uploadResp.json();
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the identification service.' });
    return null;
  }

  const directUpload = uploadInfo?.['direct-upload'];
  const signedId = uploadInfo?.['signed-id'];
  if (!directUpload?.url || !signedId) {
    res.status(502).json({ error: 'Could not reach the identification service.' });
    return null;
  }

  // Step 3 - PUT the bytes. Send ONLY the headers the API handed back: this
  // URL's signature covers that exact set, and any extra header (including the
  // Content-Type fetch would add on its own) makes Google reject it with 403.
  try {
    const putResp = await fetch(directUpload.url, withTimeout({
      method: 'PUT',
      headers: { ...(directUpload.headers || {}) },
      body: buffer,
    }));
    if (!putResp.ok) throw new Error(`upload ${putResp.status}`);
  } catch (err) {
    res.status(502).json({ error: 'Could not upload the photo for identification.' });
    return null;
  }

  // Step 4 - run recognition against the uploaded blob.
  try {
    const recogResp = await fetch(
      `${API_BASE}/recognition/image?q=${encodeURIComponent(signedId)}`,
      withTimeout({ headers: { Authorization: `Bearer ${token}` } })
    );
    if (recogResp.status === 401) invalidateToken();
    const data = await recogResp.json();
    if (!recogResp.ok || data?.errors) {
      res.status(502).json({ error: 'Could not identify this photo. Please try again.' });
      return null;
    }
    return data;
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the identification service.' });
    return null;
  }
}

module.exports = { fishialIdentify };
