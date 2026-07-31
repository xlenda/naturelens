import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@textmarker_device_id';

// This id gates real entitlement (a Stripe subscription gets linked to it -
// see api/auth.js/verify-code.js) so it needs to come from a
// cryptographically secure source, not Math.random() (a plain, non-crypto
// PRNG whose internal state is a documented, publicly-analyzed target on the
// JS engines this app runs in). Web Crypto's getRandomValues is what's
// actually live today (this app is currently web-only, see project memory);
// Math.random() stays only as a fallback for a native build that isn't in
// production use.
function randomByte() {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    return window.crypto.getRandomValues(new Uint8Array(1))[0];
  }
  return Math.floor(Math.random() * 256);
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = randomByte() % 16;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cached = null;
let inFlight = null;

// Memoize the in-flight PROMISE, not just the resolved value - concurrent
// callers (e.g. ProfileScreen's useEffect and useFocusEffect both firing on
// mount) must all await the SAME read-or-create instead of racing
// independently, or two different ids can get generated and one silently
// orphans a paid subscription tied to whichever id loses the race.
export async function getDeviceId() {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = generateId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    cached = id;
    return id;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// Used by account deletion: clears the locally stored id so a fresh random
// one is generated on the next getDeviceId() call, fully detaching this
// device from any subscription/usage history server-side.
export async function resetDeviceId() {
  cached = null;
  inFlight = null;
  await AsyncStorage.removeItem(DEVICE_ID_KEY);
}
