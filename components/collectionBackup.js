import { Platform } from 'react-native';
import { COLLECTION_KEY, getCollection } from './storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
const { mergeCollections } = require('./collectionMerge');
const { normaliseCollectionEntry } = require('./collectionEntrySchema');

// Export and restore the collection.
//
// This closes the one hole in the app where a user can lose something
// irreplaceable. The collection lives ONLY in this browser's storage: clear the
// site data, switch phones, or let iOS evict a rarely-opened PWA's storage (it
// does that), and a year of finds is gone. The subscription comes back through
// Restore Access; the collection does not come back at all.
//
// Deliberately a plain JSON file the user holds, not a cloud feature: it works
// today, for everyone, with no account and no server. Cloud sync is the better
// answer for subscribers and can come later - but a paying customer losing their
// collection while waiting for the better answer is not acceptable.

const FORMAT = 'naturelens-collection';
const FORMAT_VERSION = 1;
const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const MAX_BACKUP_ITEMS = 500;

function backupByteLength(value) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  return value.length * 2;
}

function invalidBackup(code = 'invalid_file') {
  const err = new Error('invalid backup');
  err.code = code;
  return err;
}

function timestampForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Builds the backup payload. Kept separate from the download so the same data
 * can later be pushed to a server without duplicating the shape.
 */
export async function buildBackup() {
  const collection = await getCollection();
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    count: collection.length,
    items: collection,
  };
}

/**
 * Downloads the backup as a .json file. Web only - a native build would use the
 * share sheet instead, and there is no native build today.
 * @returns true when the download was started.
 */
export async function exportCollection() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;

  const backup = await buildBackup();
  if (backup.count === 0) return false;

  try {
    // Photos are stored as data URIs inside each item, so the file is large but
    // fully self-contained - it restores without needing anything else.
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `naturelens-${timestampForFilename()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke on the next tick: revoking synchronously can cancel the download
    // in some browsers before it starts.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Merges a backup file into the current collection.
 *
 * MERGE, never replace. Someone restoring on a phone that already has finds
 * must not lose them - and a restore that silently wipes the current collection
 * would be a second way to lose data, which defeats the whole point.
 *
 * @returns { added, skipped, total } or throws with .code
 */
export async function importCollection(fileText) {
  if (typeof fileText !== 'string' || backupByteLength(fileText) > MAX_BACKUP_BYTES) {
    throw invalidBackup('file_too_large');
  }
  let parsed;
  try {
    parsed = JSON.parse(fileText);
  } catch (e) {
    const err = new Error('invalid');
    err.code = 'invalid_file';
    throw err;
  }

  if (parsed?.format !== FORMAT || !Array.isArray(parsed.items)) {
    const err = new Error('not a NatureLens backup');
    err.code = 'wrong_format';
    throw err;
  }

  // Newer file than this build understands: refuse rather than importing a
  // shape we might mangle.
  if (typeof parsed.version === 'number' && parsed.version > FORMAT_VERSION) {
    const err = new Error('newer version');
    err.code = 'newer_version';
    throw err;
  }

  if (parsed.items.length > MAX_BACKUP_ITEMS) throw invalidBackup('too_many_items');
  const importedItems = parsed.items.map((item) => normaliseCollectionEntry(item, { strict: true }));
  if (importedItems.some((item) => !item)) throw invalidBackup('invalid_item');

  const current = await getCollection();
  // O mesmo savedId pode estar mais novo no arquivo (apelido, comodo ou rega).
  // O merge por updatedAt restaura essa edicao e preserva a foto do aparelho.
  const merge = mergeCollections(current, importedItems, new Set());
  const applied = merge.added + merge.updated;

  if (applied === 0) {
    return { added: 0, skipped: parsed.items.length, total: current.length };
  }

  try {
    await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(merge.entries));
  } catch (e) {
    // Storage quota is the realistic failure here: photo data URIs are heavy.
    const err = new Error('could not save');
    err.code = 'storage_full';
    throw err;
  }

  return {
    // A mensagem existente chama de "adicionado" todo item aplicado. Isso
    // inclui uma versao mais nova restaurada no mesmo savedId.
    added: applied,
    skipped: parsed.items.length - applied,
    total: merge.entries.length,
  };
}

/**
 * Opens a file picker and imports what the user chooses. Web only.
 * Resolves with the same shape as importCollection, or null if cancelled.
 */
export function pickAndImport() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      if (file.size > MAX_BACKUP_BYTES) {
        reject(invalidBackup('file_too_large'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        importCollection(String(reader.result)).then(resolve).catch(reject);
      };
      reader.onerror = () => {
        const err = new Error('could not read file');
        err.code = 'unreadable';
        reject(err);
      };
      reader.readAsText(file);
    };

    // There is no reliable "cancelled" event on a file input across browsers,
    // so a cancelled picker simply never resolves. That is fine: nothing is
    // blocked on it, and the promise is garbage collected with the input.
    input.click();
  });
}

export { MAX_BACKUP_BYTES, MAX_BACKUP_ITEMS };
