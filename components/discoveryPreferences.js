import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@naturelens_discovery_preferences_v1';

export const DISCOVERY_GOALS = Object.freeze({
  IDENTIFY: 'identify',
  SAFETY: 'safety',
  CARE: 'care',
  FIELD: 'field',
  LEARN: 'learn',
});

export const DISCOVERY_CONTEXTS = Object.freeze({
  HOME: 'home',
  FIELD: 'field',
  NATURE: 'nature',
  WATER: 'water',
  STUDY: 'study',
});

export const DISCOVERY_DEPTHS = Object.freeze({
  ESSENTIAL: 'essential',
  VISUAL: 'visual',
  TECHNICAL: 'technical',
});

const GOALS = new Set(Object.values(DISCOVERY_GOALS));
const CONTEXTS = new Set(Object.values(DISCOVERY_CONTEXTS));
const DEPTHS = new Set(Object.values(DISCOVERY_DEPTHS));

export const DEFAULT_DISCOVERY_PREFERENCES = Object.freeze({
  version: 1,
  goal: DISCOVERY_GOALS.IDENTIFY,
  context: DISCOVERY_CONTEXTS.NATURE,
  depth: DISCOVERY_DEPTHS.ESSENTIAL,
  preferredCategory: 'plant',
});

const listeners = new Set();
let cachedPreferences = { ...DEFAULT_DISCOVERY_PREFERENCES };
let writeQueue = Promise.resolve();

function categoryForContext(context) {
  if (context === DISCOVERY_CONTEXTS.FIELD) return 'crop';
  if (context === DISCOVERY_CONTEXTS.WATER) return 'fish';
  return 'plant';
}

function normalise(value = {}) {
  const context = CONTEXTS.has(value.context)
    ? value.context
    : DEFAULT_DISCOVERY_PREFERENCES.context;
  return {
    version: 1,
    goal: GOALS.has(value.goal) ? value.goal : DEFAULT_DISCOVERY_PREFERENCES.goal,
    context,
    depth: DEPTHS.has(value.depth) ? value.depth : DEFAULT_DISCOVERY_PREFERENCES.depth,
    preferredCategory:
      typeof value.preferredCategory === 'string' && value.preferredCategory
        ? value.preferredCategory
        : categoryForContext(context),
  };
}

function notify(value) {
  listeners.forEach((listener) => {
    try {
      listener(value);
    } catch {}
  });
}

export async function getDiscoveryPreferences() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cachedPreferences = raw ? normalise(JSON.parse(raw)) : { ...DEFAULT_DISCOVERY_PREFERENCES };
  } catch {
    cachedPreferences = { ...DEFAULT_DISCOVERY_PREFERENCES };
  }
  return { ...cachedPreferences };
}

async function persistDiscoveryPreferences(value) {
  const next = normalise(value);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  cachedPreferences = next;
  notify(next);
  return next;
}

export function saveDiscoveryPreferences(value) {
  const task = writeQueue.then(() => persistDiscoveryPreferences(value));
  writeQueue = task.catch(() => ({ ...cachedPreferences }));
  return task;
}

export function getCachedDiscoveryPreferences() {
  return { ...cachedPreferences };
}

export function updateDiscoveryPreferences(patch) {
  const task = writeQueue.then(async () => {
    const current = await getDiscoveryPreferences();
    return persistDiscoveryPreferences({ ...current, ...patch });
  });
  writeQueue = task.catch(() => ({ ...cachedPreferences }));
  return task;
}

export function suggestedCategoryForContext(context) {
  return categoryForContext(context);
}

export function subscribeDiscoveryPreferences(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
