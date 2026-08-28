import { CATEGORIES } from './categories';
import { getDeviceId } from './deviceId';
import { getApproximateLocation } from './deviceLocation';
import i18n from '../i18n';
import { API_BASE } from './apiBase';
import { normaliseAppLanguage } from './appLanguage';

// Somente os modelos Kindwise usam localizacao como contexto taxonomico. Os
// fornecedores de peixe e ave nao recebem esse campo, exatamente como a
// politica publicada promete; assim eles tambem nao esperam por uma permissao
// que nao melhora a resposta deles.
const LOCATION_CATEGORIES = new Set(['plant', 'tree', 'insect', 'mushroom', 'crop']);
const SOUND_REQUEST_TIMEOUT_MS = 60000;


/**
 * `photos` may be a single base64 string or an array of up to 3 photos of the
 * SAME specimen. Kindwise uses every angle it is given for one identification,
 * which measurably improves accuracy - a leaf close-up plus the whole plant
 * beats either on its own. Fish and bird vendors take one image and ignore the
 * extras (handled server-side).
 */
export async function identify(category, photos) {
  const meta = CATEGORIES[category] || CATEGORIES.plant;
  const deviceId = await getDeviceId();
  const list = Array.isArray(photos) ? photos.filter(Boolean) : [photos].filter(Boolean);

  // Offline check before spending a tap. An identification is a live API
  // call - offline it can only fail, and failing with "could not reach the
  // service" reads as a broken app rather than as "you have no signal".
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const err = new Error(i18n.t('identify.offlineBody'));
    err.offline = true;
    throw err;
  }

  // Roughly where and when, which measurably narrows the answer - the same photo
  // of a small brown mushroom means different things in São Paulo and in Norway.
  // Awaited, but it can never stall a scan: getApproximateLocation resolves null
  // within 6 seconds whatever happens, and returns null immediately when the
  // feature is off or was refused.
  const place = LOCATION_CATEGORIES.has(meta.key) ? await getApproximateLocation() : null;

  // Every category goes through one merged serverless handler (api/identify.js)
  // rather than one endpoint per category - see that file for why (Vercel Hobby
  // caps a deployment at 12 functions). The category travels in the body; the
  // old /api/identify-<category> URLs still resolve here via a rewrite in
  // vercel.json, so cached bundles and installed PWAs keep working.
  const response = await fetch(`${API_BASE}/api/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: meta.key,
      // `image` kept alongside `images` so a server running older code (or a
      // rollback) still receives something usable.
      image: list[0],
      images: list,
      language: normaliseAppLanguage(i18n.language),
      deviceId,
      ...(place || {}),
    }),
  });

  // Vercel's own error pages (504 timeout, 413 payload-too-large) are HTML,
  // not JSON - an unconditional .json() here turned those into a raw
  // "SyntaxError: Unexpected token <" shown to the user (Fable review
  // finding). Parse defensively and let the status code drive the message.
  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  if (!response.ok) {
    // A server-side outage - the vendor is down, or the owner's credit ran out -
    // is not the user's fault and not something they can fix by trying a better
    // photo. It gets its own translated message rather than the English sentence
    // the API happens to send.
    if (data?.reason === 'serviceUnavailable' || data?.reason === 'vendorError') {
      const err = new Error(i18n.t('identify.serviceDownBody'));
      err.serviceDown = true;
      throw err;
    }
    // A generic server-side failure. The API also sends an English sentence in
    // `error` for logs, but showing it would put English in front of 16 other
    // languages - the app already has this message translated.
    if (data?.reason === 'identifyFailed') {
      throw new Error(i18n.t('identify.identificationFailedDefault'));
    }
    // 402 carries a real, actionable meaning (free uses spent) and the screen
    // turns it into a paywall rather than a message, so its text is never shown.
    if (response.status === 402) {
      const err = new Error(i18n.t('identify.identificationFailedDefault'));
      err.paymentRequired = true;
      throw err;
    }
    throw new Error(data?.error || i18n.t('identify.serviceDownBody'));
  }

  if (!data) {
    throw new Error('Could not reach the identification service.');
  }

  if (data.notFound) {
    const label = i18n.t(`categories.${meta.key}.label`).toLowerCase();
    throw new Error(i18n.t('identify.notFoundError', { category: label }));
  }

  return data.entity;
}

/**
 * Identification by SOUND. Separate export rather than a branch inside
 * identify() because the payload is fundamentally different - float32 PCM plus
 * a sample rate, no photo - and folding it in would mean a function whose
 * arguments contradict each other depending on the category.
 */
export async function identifySound(audioBase64, sampleRate, { signal } = {}) {
  const deviceId = await getDeviceId();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const err = new Error(i18n.t('identify.offlineBody'));
    err.offline = true;
    throw err;
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromLifecycle = () => controller.abort();
  if (signal?.aborted) abortFromLifecycle();
  else signal?.addEventListener?.('abort', abortFromLifecycle, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SOUND_REQUEST_TIMEOUT_MS);

  let response;
  let data = null;
  try {
    response = await fetch(`${API_BASE}/api/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'sound',
        audio: audioBase64,
        sampleRate,
        language: normaliseAppLanguage(i18n.language),
        deviceId,
      }),
      signal: controller.signal,
    });

    // fetch() resolves when response headers arrive. Keep both the lifecycle
    // cancellation and the deadline armed while the body is still streaming;
    // otherwise a stalled inference proxy can leave response.json() pending
    // forever after the visible screen has already gone away.
    try {
      data = await response.json();
    } catch (cause) {
      if (controller.signal.aborted) throw cause;
      data = null;
    }
    if (controller.signal.aborted) {
      const cause = new Error('aborted');
      cause.name = 'AbortError';
      throw cause;
    }
  } catch (cause) {
    const err = new Error(i18n.t('identify.serviceDownBody'));
    err.aborted = controller.signal.aborted;
    err.timedOut = timedOut;
    err.serviceDown = true;
    err.cause = cause;
    throw err;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.('abort', abortFromLifecycle);
  }

  if (!response.ok) {
    // A server-side outage - the vendor is down, or the owner's credit ran out -
    // is not the user's fault and not something they can fix by trying a better
    // photo. It gets its own translated message rather than the English sentence
    // the API happens to send.
    if (data?.reason === 'serviceUnavailable' || data?.reason === 'vendorError') {
      const err = new Error(i18n.t('identify.serviceDownBody'));
      err.serviceDown = true;
      throw err;
    }
    // A generic server-side failure. The API also sends an English sentence in
    // `error` for logs, but showing it would put English in front of 16 other
    // languages - the app already has this message translated.
    if (data?.reason === 'identifyFailed') {
      throw new Error(i18n.t('identify.identificationFailedDefault'));
    }
    // 402 carries a real, actionable meaning (free uses spent) and the screen
    // turns it into a paywall rather than a message, so its text is never shown.
    if (response.status === 402) {
      const err = new Error(i18n.t('identify.identificationFailedDefault'));
      err.paymentRequired = true;
      throw err;
    }
    throw new Error(data?.error || i18n.t('identify.serviceDownBody'));
  }

  if (!data) throw new Error('Could not reach the identification service.');

  if (data.notFound) {
    // The server distinguishes "no animal in this recording" from "this is a car
    // / applause / speech". Telling someone to get closer to a passing bus is
    // useless advice, so the two get different messages.
    throw new Error(
      data.reason === 'notWildlife'
        ? i18n.t('sound.notWildlifeBody')
        : i18n.t('sound.notFoundBody')
    );
  }

  return data.entity;
}
