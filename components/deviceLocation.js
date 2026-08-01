import AsyncStorage from '@react-native-async-storage/async-storage';

// Approximate location, used to make identifications more accurate.
//
// WHY IT HELPS
// Kindwise (plants, insects, mushrooms, crops) weights its answer by where and
// when the photo was taken - verified against the live API, which echoes the
// coordinates back in `input.latitude`. Half the world's lookalike species are
// separated by range alone: the same photo of a small brown mushroom means
// different things in São Paulo and in Norway. Season matters for the same
// reason, which is why the timestamp travels with it.
//
// WHAT IS DELIBERATELY NOT DONE
//   * No high accuracy. `enableHighAccuracy: false` uses wifi/cell positioning
//     instead of the GPS chip: far faster, no battery cost, and a species range
//     does not care about metres.
//   * Coordinates are ROUNDED to 2 decimal places (~1.1 km) before they leave
//     the device. That is more than precise enough to place a specimen inside a
//     species' range, and it stops the app from building a log of exactly which
//     house someone was standing outside. Precision nobody needs is precision
//     nobody should collect.
//   * Never blocks. If permission is refused, or the fix takes too long, the
//     identification goes ahead without it - a slightly less accurate answer
//     beats a spinner.
//   * Never asks twice in a row. A refusal is remembered, so the app does not
//     nag someone who already said no.

const PREF_KEY = '@naturelens/use_location';
const DENIED_KEY = '@naturelens/location_denied';

// A fix older than this is still fine - people identify several things in the
// same place - but beyond it the position is re-read.
const MAX_AGE_MS = 5 * 60 * 1000;
// Long enough for a wifi-based fix, short enough that nobody watches a spinner.
const TIMEOUT_MS = 6000;

let cached = null; // { latitude, longitude, at }

// When the last attempt failed, and how long to wait before trying again.
//
// Without this, a device that simply cannot produce a fix - indoors, no GPS, a
// desktop browser, permission granted but the hardware never answers - paid the
// full guard timeout on the critical path of EVERY identification, forever. Six
// and a half seconds added to every scan, silently, with nothing to show for it.
//
// A failure is remembered for five minutes. That is short enough that walking
// outside starts working on the next scan, and long enough that a scanning
// session indoors is not five separate six-second stalls.
let lastFailureAt = 0;
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;

// How long a refusal is respected before the app is willing to ask again.
// See the PERMISSION_DENIED branch in readPosition for why this is a duration
// and not a permanent flag.
const DENIED_RETRY_MS = 24 * 60 * 60 * 1000;

export function canUseLocation() {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

/** Has the user turned the feature on? Defaults to ON - it only ever improves
 *  the answer, and the browser's own permission prompt is the real gate. */
export async function isLocationEnabled() {
  try {
    const value = await AsyncStorage.getItem(PREF_KEY);
    return value !== '0';
  } catch (e) {
    return true;
  }
}

export async function setLocationEnabled(enabled) {
  try {
    await AsyncStorage.setItem(PREF_KEY, enabled ? '1' : '0');
    // Turning it back on is an explicit request to try again, so clear the
    // remembered refusal.
    if (enabled) await AsyncStorage.removeItem(DENIED_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

function readPosition() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    // Belt and braces: some browsers have historically ignored the timeout
    // option and left the callback pending forever.
    const guard = setTimeout(() => done(null), TIMEOUT_MS + 500);

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(guard);
          done(position);
        },
        (error) => {
          clearTimeout(guard);
          // 1 === PERMISSION_DENIED. Remembered so the next scan does not
          // trigger another prompt - but with a TIMESTAMP, not a permanent flag.
          //
          // A permanent flag was wrong: browsers report a dismissed prompt with
          // the same code as a deliberate "Block", so tapping outside the dialog
          // by accident killed the feature for good. The Profile switch still
          // read "on", so there was nothing to turn back on and no way to
          // discover what had happened.
          //
          // With a timestamp the app stays quiet for a day - long enough not to
          // nag someone who meant it - and then asks once more. Someone who
          // really did block it sees no prompt at all, because the browser
          // remembers that itself and rejects without asking.
          if (error && error.code === 1) {
            AsyncStorage.setItem(DENIED_KEY, String(Date.now())).catch(() => {});
          }
          done(null);
        },
        { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS }
      );
    } catch (e) {
      clearTimeout(guard);
      done(null);
    }
  });
}

/**
 * @returns { latitude, longitude, datetime } or null. Never throws, never
 *          rejects, and never takes longer than TIMEOUT_MS to give up.
 */
export async function getApproximateLocation() {
  if (!canUseLocation()) return null;
  if (!(await isLocationEnabled())) return null;

  try {
    const deniedAt = Number(await AsyncStorage.getItem(DENIED_KEY));
    if (deniedAt && Date.now() - deniedAt < DENIED_RETRY_MS) return null;
  } catch (e) {
    // Storage unavailable - fall through and just try.
  }

  if (cached && Date.now() - cached.at < MAX_AGE_MS) {
    return { latitude: cached.latitude, longitude: cached.longitude, datetime: localIsoNow() };
  }

  // Recently failed? Do not spend the timeout again - see lastFailureAt.
  if (Date.now() - lastFailureAt < FAILURE_BACKOFF_MS) return null;

  const position = await readPosition();
  const coords = position?.coords;
  if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
    lastFailureAt = Date.now();
    return null;
  }
  lastFailureAt = 0;

  // See the note at the top: ~1.1 km is all a species range needs.
  const latitude = Math.round(coords.latitude * 100) / 100;
  const longitude = Math.round(coords.longitude * 100) / 100;
  cached = { latitude, longitude, at: Date.now() };

  return { latitude, longitude, datetime: localIsoNow() };
}

/**
 * "2026-07-30T17:52:58" - ISO without milliseconds and without a Z.
 *
 * Not a style choice: the Kindwise API rejects `2026-07-30T17:52:58Z` with
 * "Datetime ... is not in ISO format", and rejects a Unix timestamp with "is not
 * a string". Verified against the live endpoint - this exact shape is the one it
 * accepts and echoes back.
 *
 * Local time, not UTC, because the point of sending it is the season and the
 * time of day where the specimen actually is.
 */
function localIsoNow() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}
