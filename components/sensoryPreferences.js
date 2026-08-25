import AsyncStorage from '@react-native-async-storage/async-storage';

export const SENSORY_PREFERENCES_KEY = '@naturelens_sensory_preferences_v1';

export const MOTION_MODES = Object.freeze({
  SYSTEM: 'system',
  REDUCED: 'reduced',
  FULL: 'full',
});

export const DEFAULT_SENSORY_PREFERENCES = Object.freeze({
  hapticsEnabled: true,
  motionMode: MOTION_MODES.SYSTEM,
});

const listeners = new Set();
let cachedPreferences = null;
let pendingRead = null;
let pendingWrite = Promise.resolve();

const snapshot = (value) => ({
  hapticsEnabled: value.hapticsEnabled,
  motionMode: value.motionMode,
});

function normalisePreferences(value) {
  const motionModes = Object.values(MOTION_MODES);
  return {
    hapticsEnabled: typeof value?.hapticsEnabled === 'boolean'
      ? value.hapticsEnabled
      : DEFAULT_SENSORY_PREFERENCES.hapticsEnabled,
    motionMode: motionModes.includes(value?.motionMode)
      ? value.motionMode
      : DEFAULT_SENSORY_PREFERENCES.motionMode,
  };
}

function validatePreference(key, value) {
  if (key === 'hapticsEnabled' && typeof value === 'boolean') return;
  if (key === 'motionMode' && Object.values(MOTION_MODES).includes(value)) return;
  throw new TypeError(`Invalid sensory preference: ${String(key)}`);
}

function notify(preferences) {
  const value = snapshot(preferences);
  listeners.forEach((listener) => {
    try {
      listener(value);
    } catch (e) {
      // Uma tela com listener defeituoso nao pode impedir as outras de atualizar.
    }
  });
}

export async function getSensoryPreferences() {
  if (cachedPreferences) return snapshot(cachedPreferences);
  if (pendingRead) return pendingRead.then(snapshot);

  pendingRead = AsyncStorage.getItem(SENSORY_PREFERENCES_KEY)
    .then((raw) => {
      let stored = null;
      try {
        stored = raw ? JSON.parse(raw) : null;
      } catch (e) {
        stored = null;
      }
      cachedPreferences = normalisePreferences(stored);
      return cachedPreferences;
    })
    .catch(() => {
      cachedPreferences = normalisePreferences(null);
      return cachedPreferences;
    })
    .finally(() => {
      pendingRead = null;
    });

  return pendingRead.then(snapshot);
}

export function setSensoryPreference(key, value) {
  validatePreference(key, value);

  // Duas mudancas rapidas nao podem ler o mesmo snapshot e apagar uma a outra.
  const write = pendingWrite.catch(() => {}).then(async () => {
    const current = await getSensoryPreferences();
    if (current[key] === value) return current;

    const next = normalisePreferences({ ...current, [key]: value });
    await AsyncStorage.setItem(SENSORY_PREFERENCES_KEY, JSON.stringify(next));
    cachedPreferences = next;
    notify(next);
    return snapshot(next);
  });

  pendingWrite = write;
  return write;
}

export function subscribeSensoryPreferences(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}
