import { API_BASE } from './apiBase';
import { getDeviceId } from './deviceId';
import i18n from '../i18n';

// Client for the specialist chat (api/ask.js).
//
// Sends the recent conversation so the specialist can follow up ("and how often
// in winter?") instead of treating every message as the first one - which is
// exactly what made the old keyword version feel like a machine.

export const ASK_ERRORS = {
  NOT_CONFIGURED: 'not_configured',
  OFFLINE: 'offline',
  RATE_LIMITED: 'rate_limited',
  UPSTREAM: 'upstream',
};

/**
 * @param history  [{ role: 'user'|'assistant', content }] - most recent last
 * @param context  optional species summary, when asking from a detail screen
 * @returns { text } or throws an Error whose .code is one of ASK_ERRORS
 */
export async function askSpecialist(history, context) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const err = new Error('offline');
    err.code = ASK_ERRORS.OFFLINE;
    throw err;
  }

  const deviceId = await getDeviceId();

  let response;
  try {
    response = await fetch(`${API_BASE}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        language: i18n.language,
        context: context || null,
        messages: history,
      }),
    });
  } catch (e) {
    const err = new Error('network');
    err.code = ASK_ERRORS.UPSTREAM;
    throw err;
  }

  // 429 gets its own code so the UI can say "slow down" rather than "something
  // went wrong" - a generic error here reads as a broken feature.
  if (response.status === 429) {
    const err = new Error('rate limited');
    err.code = ASK_ERRORS.RATE_LIMITED;
    throw err;
  }

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  if (!response.ok || !data?.text) {
    const err = new Error(data?.error || 'upstream');
    err.code = data?.error === 'not_configured' ? ASK_ERRORS.NOT_CONFIGURED : ASK_ERRORS.UPSTREAM;
    throw err;
  }

  const sources = Array.isArray(data.sources)
    ? data.sources.filter((source) => {
      if (typeof source?.title !== 'string' || !source.title.trim() || typeof source?.url !== 'string') return false;
      try { return new URL(source.url).protocol === 'https:'; } catch (e) { return false; }
    }).slice(0, 8).map((source) => ({
      marker: /^K[1-5]$/.test(source.marker) ? source.marker : '',
      title: source.title.trim().slice(0, 240),
      url: source.url.slice(0, 1000),
    }))
    : [];
  return { text: data.text, sources };
}

/**
 * Flags one AI answer as offensive/wrong (Google Play's AI-generated-content
 * policy requires an in-app report path). Fire-and-forget from the UI's point
 * of view: the tap is acknowledged optimistically, and a lost report is not
 * worth an error dialog in a chat.
 */
export async function reportSpecialistAnswer(text) {
  const deviceId = await getDeviceId();
  await fetch(`${API_BASE}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, report: { message: String(text || '').slice(0, 2000) } }),
  });
}
