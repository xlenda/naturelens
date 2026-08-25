import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApproximateLocation } from './deviceLocation';

const STORAGE_KEY = '@naturelens_care_region';

export const CARE_REGION = Object.freeze({
  AUTO: 'auto',
  NORTH: 'north',
  SOUTH: 'south',
});

const VALID = new Set(Object.values(CARE_REGION));
const listeners = new Set();

export async function getCareRegionPreference() {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    return VALID.has(value) ? value : CARE_REGION.AUTO;
  } catch {
    return CARE_REGION.AUTO;
  }
}

export async function setCareRegionPreference(value) {
  if (!VALID.has(value)) return false;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value);
    listeners.forEach((listener) => listener(value));
    return true;
  } catch {
    return false;
  }
}

export function subscribeCareRegion(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A preferencia manual afeta SOMENTE calendario e floracao. Nunca vira uma
// coordenada enviada ao identificador: inventar local para ganhar precisao
// seria pior do que omitir localizacao. +/-23 serve apenas como sinal do
// hemisferio para os componentes que ja trabalham por estacao.
export async function getCareLatitude() {
  const preference = await getCareRegionPreference();
  if (preference === CARE_REGION.NORTH) return 23;
  if (preference === CARE_REGION.SOUTH) return -23;
  const location = await getApproximateLocation();
  return typeof location?.latitude === 'number' ? location.latitude : null;
}
