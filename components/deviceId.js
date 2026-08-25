import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = '@textmarker_device_id';

function generateId() {
  // Esse id protege vinculo pago, uso gratis e exclusao. Expo Crypto usa a
  // fonte segura de cada sistema; cair para um gerador previsivel no Android tornaria a
  // identidade previsivel justamente no binario publicado.
  const id = Crypto.randomUUID?.();
  if (typeof id !== 'string' || !id) throw new Error('Secure device id unavailable');
  return id;
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
