import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getWateringStatus } from './watering';

export const COLLECTION_KEY = '@plantid_collection';
const PROFILE_PHOTO_KEY = '@naturelens_profile_photo';
const MAX_SPECIMEN_NOTE_LENGTH = 500;
const pendingSaves = new Map();
let collectionWriteTail = Promise.resolve();

async function cancelLocalRemindersForEntry(savedId) {
  try {
    const reminders = require('./localReminders');
    if (!reminders.isNativeReminderAvailable()) return true;
    const result = await reminders.cancelRemindersForSavedId(savedId);
    return result?.ok === true;
  } catch (e) {
    return false;
  }
}

async function cancelAllLocalReminders() {
  try {
    const reminders = require('./localReminders');
    if (!reminders.isNativeReminderAvailable()) return true;
    const result = await reminders.clearLocalReminders();
    return result?.ok === true;
  } catch (e) {
    return false;
  }
}

function queueCollectionWrite(work) {
  const pending = collectionWriteTail.then(work, work);
  collectionWriteTail = pending.then(() => undefined, () => undefined);
  return pending;
}

function randomUuid() {
  const candidate = Crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) {
    throw new Error('secure-uuid-unavailable');
  }
  return candidate;
}

function uniqueSavedIdFromSet(existing) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomUuid();
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error('secure-uuid-collision');
}

function uniqueSavedId(list) {
  return uniqueSavedIdFromSet(new Set(list.map((entry) => entry?.savedId).filter(Boolean)));
}

function isCollectionObject(entry) {
  return entry && typeof entry === 'object' && !Array.isArray(entry);
}

function repairCollectionEntries(list) {
  const reserved = new Set(
    list
      .map((entry) => (
        isCollectionObject(entry) && typeof entry.savedId === 'string'
          ? entry.savedId.trim()
          : ''
      ))
      .filter(Boolean)
  );
  const seen = new Set();
  let changed = false;
  const entries = [];

  for (const entry of list) {
    if (!isCollectionObject(entry)) {
      changed = true;
      continue;
    }

    const savedId = typeof entry.savedId === 'string' ? entry.savedId.trim() : '';
    if (savedId && !seen.has(savedId)) {
      seen.add(savedId);
      entries.push(savedId === entry.savedId ? entry : { ...entry, savedId });
      changed = changed || savedId !== entry.savedId;
      continue;
    }

    const replacement = uniqueSavedIdFromSet(reserved);
    reserved.add(replacement);
    seen.add(replacement);
    entries.push({ ...entry, savedId: replacement });
    changed = true;
  }

  return { entries, changed };
}

function nextTimestamp(...values) {
  let time = Date.now();
  for (const value of values) {
    const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
    if (Number.isFinite(parsed)) time = Math.max(time, parsed + 1);
  }
  return new Date(time).toISOString();
}

export async function getCollection() {
  try {
    const raw = await AsyncStorage.getItem(COLLECTION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const repaired = repairCollectionEntries(parsed);
    if (!repaired.changed) return repaired.entries;
    try {
      await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(repaired.entries));
      return repaired.entries;
    } catch (e) {
      // Sem persistencia nao fingimos que a migracao ocorreu; a proxima leitura
      // tenta de novo e nenhum update passa a mirar uma identidade fantasma.
      return repaired.entries;
    }
  } catch (e) {
    return [];
  }
}

export async function getCollectionEntry(savedId) {
  if (typeof savedId !== 'string' || !savedId) return null;
  const list = await getCollection();
  return list.find((entry) => entry?.savedId === savedId) || null;
}

function pendingSaveKey(plant) {
  const value = isCollectionObject(plant) ? plant : {};
  return JSON.stringify([
    value.category || '',
    value.id || '',
    value.scientific || '',
    value.name || '',
    value.photoUri || '',
    value.referencePhoto || '',
  ]);
}

export function saveToCollection(plant) {
  const key = pendingSaveKey(plant);
  const existing = pendingSaves.get(key);
  if (existing) return existing;

  const pending = queueCollectionWrite(async () => {
    try {
      const list = await getCollection();
      const now = new Date().toISOString();
      const entry = {
        ...(isCollectionObject(plant) ? plant : {}),
        savedId: uniqueSavedId(list),
        savedAt: now,
        updatedAt: now,
      };
      const next = [entry, ...list];
      await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(next));
      return entry;
    } catch (e) {
      return null;
    }
  });

  pendingSaves.set(key, pending);
  const clear = () => {
    if (pendingSaves.get(key) === pending) pendingSaves.delete(key);
  };
  pending.then(clear, clear);
  return pending;
}

export function removeFromCollection(savedId) {
  return queueCollectionWrite(async () => {
    try {
      const list = await getCollection();
      const index = list.findIndex((entry) => entry?.savedId === savedId);
      if (index < 0) return null;
      // O exemplar so desaparece depois que o Android confirmou o cancelamento.
      // Assim nenhum lembrete orfao abre uma ficha que ja nao existe.
      if (!await cancelLocalRemindersForEntry(savedId)) return null;
      const next = list.slice();
      next.splice(index, 1);
      await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(next));
      // Remember the deletion so cloud sync can carry it to the user's other
      // devices. Without a tombstone the next sync would pull this find straight
      // back from another device and the app would look like it refuses
      // deletions. Imported lazily: storage.js is used on every screen and must
      // not drag the sync module into every bundle path.
      try {
        const { rememberDeletion } = require('./collectionSync');
        // A exclusao so terminou quando o tombstone tambem chegou ao storage.
        // Sem await, fechar o app logo depois do toque podia matar essa escrita e
        // o proximo sync ressuscitava o item remoto.
        await rememberDeletion(savedId);
      } catch (e) {
        /* sync unavailable - the local deletion still stands */
      }
      return next;
    } catch (e) {
      return null;
    }
  });
}

/**
 * Replaces the whole collection. Used ONLY by cloud sync, which has already
 * merged local and remote - never call it with a list that has not been merged,
 * because it is the one function here that can lose finds.
 */
export function replaceCollection(list) {
  return queueCollectionWrite(async () => {
    try {
      if (!Array.isArray(list)) return null;
      const repaired = repairCollectionEntries(list);
      await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(repaired.entries));
      return repaired.entries;
    } catch (e) {
      return null;
    }
  });
}

export function updateCollectionEntry(savedId, patch) {
  if (typeof savedId !== 'string' || !savedId || !patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return Promise.resolve(null);
  }

  return queueCollectionWrite(async () => {
    try {
      const list = await getCollection();
      const index = list.findIndex((entry) => entry?.savedId === savedId);
      if (index < 0) return null;

      const current = list[index];
      const safePatch = { ...patch };
      delete safePatch.savedId;
      delete safePatch.savedAt;
      delete safePatch.updatedAt;
      delete safePatch.specimenNoteUpdatedAt;

      let updatedAt;
      if (Object.prototype.hasOwnProperty.call(safePatch, 'specimenNote')) {
        const note = typeof safePatch.specimenNote === 'string' ? safePatch.specimenNote : '';
        safePatch.specimenNote = note.trim().slice(0, MAX_SPECIMEN_NOTE_LENGTH);
        updatedAt = nextTimestamp(current.updatedAt, current.specimenNoteUpdatedAt);
        safePatch.specimenNoteUpdatedAt = updatedAt;
      } else {
        updatedAt = nextTimestamp(current.updatedAt);
      }

      // O indice limita a escrita a um exemplar mesmo se um backup legado
      // contiver savedId duplicado. Alterar todos apagaria identidades distintas.
      const next = list.slice();
      next[index] = { ...current, ...safePatch, updatedAt };
      await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(next));
      return next;
    } catch (e) {
      return null;
    }
  });
}

export async function markCollectionWatered(savedId, wateredAt) {
  const entry = await getCollectionEntry(savedId);
  if (!entry || (entry.category !== 'plant' && entry.category !== 'tree')) return null;

  const parsed = typeof wateredAt === 'string' ? Date.parse(wateredAt) : NaN;
  if (wateredAt !== undefined && !Number.isFinite(parsed)) return null;
  const lastWateredAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
  // O mesmo validador da agenda impede que um campo water perdido em fauna ou
  // um valor desconhecido vire uma rega persistida so porque a UI chamou aqui.
  if (!getWateringStatus({ ...entry, lastWateredAt })) return null;

  const entries = await updateCollectionEntry(savedId, { lastWateredAt });
  if (!entries) return null;
  const updatedEntry = entries.find((item) => item?.savedId === savedId);
  if (!updatedEntry || updatedEntry.lastWateredAt !== lastWateredAt) return null;
  return { entries, entry: updatedEntry, lastWateredAt };
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
export function clearCollection() {
  return queueCollectionWrite(async () => {
    try {
      if (!await cancelAllLocalReminders()) return false;
      await AsyncStorage.removeItem(COLLECTION_KEY);
      try {
        const { clearAgronomyData } = require('./agronomyStorage');
        await clearAgronomyData();
      } catch (e) {
        // ignore
      }
      try {
        const { clearObservationData } = require('./observationStorage');
        await clearObservationData();
      } catch (e) {
        // ignore
      }
      return true;
    } catch (e) {
      return false;
    }
  });
}
