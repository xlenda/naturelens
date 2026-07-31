import AsyncStorage from '@react-native-async-storage/async-storage';

const COLLECTION_KEY = '@plantid_collection';
const PROFILE_PHOTO_KEY = '@naturelens_profile_photo';

export async function getCollection() {
  try {
    const raw = await AsyncStorage.getItem(COLLECTION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function saveToCollection(plant) {
  try {
    const list = await getCollection();
    const entry = {
      ...plant,
      savedId: Date.now().toString(),
      savedAt: new Date().toISOString(),
    };
    const next = [entry, ...list];
    await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(next));
    return entry;
  } catch (e) {
    return null;
  }
}

export async function removeFromCollection(savedId) {
  try {
    const list = await getCollection();
    const next = list.filter((p) => p.savedId !== savedId);
    await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(next));
    return next;
  } catch (e) {
    return null;
  }
}

export async function updateCollectionEntry(savedId, patch) {
  try {
    const list = await getCollection();
    const next = list.map((p) => (p.savedId === savedId ? { ...p, ...patch } : p));
    await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(next));
    return next;
  } catch (e) {
    return null;
  }
}

// Profile photo is stored only on-device (same local-only philosophy as the
// rest of personal data in this app - see project memory) - it never
// uploads anywhere, so it does NOT sync across devices even after signing in
// with a password on another one.
export async function getProfilePhoto() {
  try {
    return await AsyncStorage.getItem(PROFILE_PHOTO_KEY);
  } catch (e) {
    return null;
  }
}

export async function saveProfilePhoto(uri) {
  try {
    await AsyncStorage.setItem(PROFILE_PHOTO_KEY, uri);
    return true;
  } catch (e) {
    return false;
  }
}

export async function clearProfilePhoto() {
  try {
    await AsyncStorage.removeItem(PROFILE_PHOTO_KEY);
  } catch (e) {
    // ignore
  }
}

// Used by account deletion to wipe all locally saved personal data (the
// collection itself, never just the server-side subscription link).
export async function clearCollection() {
  try {
    await AsyncStorage.removeItem(COLLECTION_KEY);
  } catch (e) {
    // ignore
  }
}
