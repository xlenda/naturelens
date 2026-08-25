import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@naturelens_acquisition_source_v1';

export const ACQUISITION_SOURCES = Object.freeze([
  'tiktok',
  'instagram',
  'youtube',
  'search',
  'friend',
  'other',
]);

const VALID_SOURCES = new Set([...ACQUISITION_SOURCES, 'skipped']);

function normalise(value) {
  if (!value || typeof value !== 'object') return null;
  if (!VALID_SOURCES.has(value.source)) return null;
  return {
    version: 1,
    source: value.source,
    answeredAt: typeof value.answeredAt === 'string' ? value.answeredAt : null,
  };
}

export async function getAcquisitionSource() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? normalise(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function saveAcquisitionSource(source) {
  if (!VALID_SOURCES.has(source)) return false;
  const value = { version: 1, source, answeredAt: new Date().toISOString() };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
