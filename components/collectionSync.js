import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCollection, replaceCollection } from './storage';
import { getDeviceId } from './deviceId';
import { API_BASE } from './apiBase';
const { mergeCollections } = require('./collectionMerge');

// Keeps the collection in step across a subscriber's devices.
//
// THE RULES, in order of importance:
//
//  1. MERGE, NEVER REPLACE. A sync that could empty someone's collection would
//     be a second way to lose it - which is the exact thing this feature exists
//     to prevent. Local finds the server has never seen are kept and pushed;
//     server finds this device has never seen are added.
//
//  2. DELETIONS TRAVEL AS TOMBSTONES. Without them, deleting a find here and
//     syncing would pull it straight back from the other device, and the app
//     would appear to refuse deletions.
//
//  3. THE USER'S PHOTO NEVER LEAVES THE DEVICE. Only the find is synced (see
//     api/collection.js). A find that arrives from another device therefore has
//     no personal photo - the detail screen falls back to the species reference
//     photo from Wikipedia, so it still looks like a find rather than a blank.
//
//  4. IT NEVER BLOCKS THE UI AND NEVER THROWS. Sync failing is not the user's
//     problem to solve; the local collection is authoritative and keeps working.

// savedIds deleted on this device and not yet acknowledged by the server.
const PENDING_DELETES_KEY = '@naturelens/pending_deletes';
const LAST_SYNC_KEY = '@naturelens/last_sync';

// Do not sync on every single screen focus - opening and closing the Collection
// tab three times in a minute is one intent, not three.
const MIN_INTERVAL_MS = 60 * 1000;

async function readPendingDeletes() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_DELETES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

// Remove apenas tombstones que a resposta do servidor devolveu como gravados.
// A lista e relida DEPOIS da rede: uma exclusao feita enquanto o sync estava em
// voo ainda nao foi enviada e precisa continuar pendente para a proxima rodada.
async function clearConfirmedDeletions(confirmedIds) {
  const confirmed = confirmedIds instanceof Set ? confirmedIds : new Set(confirmedIds || []);
  if (confirmed.size === 0) return;
  try {
    const current = await readPendingDeletes();
    const remaining = current.filter((savedId) => !confirmed.has(savedId));
    if (remaining.length === current.length) return;
    if (remaining.length > 0) {
      await AsyncStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(remaining));
    } else {
      await AsyncStorage.removeItem(PENDING_DELETES_KEY);
    }
  } catch (e) {
    // Confirmacao perdida so repete um tombstone idempotente no proximo sync.
    // E mais seguro do que apagar uma exclusao que o servidor nao confirmou.
  }
}

/** Called by removeFromCollection so a deletion here reaches the other devices. */
export async function rememberDeletion(savedId) {
  if (!savedId) return;
  try {
    const list = await readPendingDeletes();
    if (list.includes(savedId)) return;
    // Bounded: a tombstone list that grows forever would eventually be the
    // biggest thing in storage.
    const next = [savedId, ...list].slice(0, 500);
    await AsyncStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(next));
  } catch (e) {
    // A lost tombstone means one find may reappear on another device. Annoying,
    // not destructive - and never worth breaking a deletion over.
  }
}

/**
 * Push local finds, pull remote ones, and merge.
 *
 * @returns { synced: boolean, added: number, updated: number, removed: number,
 *            changed: boolean } Never throws.
 */
export async function syncCollection({ force = false } = {}) {
  try {
    if (!force) {
      const last = Number(await AsyncStorage.getItem(LAST_SYNC_KEY)) || 0;
      if (Date.now() - last < MIN_INTERVAL_MS) {
        return { synced: false, added: 0, updated: 0, removed: 0, changed: false };
      }
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { synced: false, added: 0, updated: 0, removed: 0, changed: false };
    }

    const [local, pendingDeletes, deviceId] = await Promise.all([
      getCollection(),
      readPendingDeletes(),
      getDeviceId(),
    ]);

    const response = await fetch(`${API_BASE}/api/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, entries: local, deletedIds: pendingDeletes }),
    });

    if (!response.ok) return { synced: false, added: 0, updated: 0, removed: 0, changed: false };

    const data = await response.json().catch(() => null);
    // Not signed in is the normal free-tier answer, not a failure.
    if (!data?.synced) return { synced: false, added: 0, updated: 0, removed: 0, changed: false };

    const remote = Array.isArray(data.entries) ? data.entries : [];
    const remoteDeleted = new Set(Array.isArray(data.deletedIds) ? data.deletedIds : []);

    // A rede abriu uma janela para a pessoa editar ou excluir um exemplar. Usar
    // a fotografia local enviada no request apagava essa mudanca ao persistir
    // qualquer adicao remota. A segunda leitura fica colada ao merge/write; as
    // lapides novas entram so no merge e continuam pendentes para o proximo push.
    const [latestLocal, latestPendingDeletes] = await Promise.all([
      getCollection(),
      readPendingDeletes(),
    ]);
    const mergeDeleted = new Set([...remoteDeleted, ...latestPendingDeletes]);
    const merge = mergeCollections(latestLocal, remote, mergeDeleted);
    // Escrever so quando o remoto mudou alguma coisa preserva quota no web. O
    // contador separado permite que a UI reaja a edicao sem fingir que e item novo.
    if (merge.changed) {
      const stored = await replaceCollection(merge.entries);
      if (!stored) {
        return { synced: false, added: 0, updated: 0, removed: 0, changed: false };
      }
    }

    // A resposta traz todos os tombstones visiveis ao servidor. Intersectar com
    // o lote enviado confirma cada ID sem apagar exclusoes novas ou rejeitadas.
    const confirmedDeletes = new Set(pendingDeletes.filter((savedId) => remoteDeleted.has(savedId)));
    await clearConfirmedDeletions(confirmedDeletes);
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now())).catch(() => {});

    return {
      synced: true,
      added: merge.added,
      updated: merge.updated,
      removed: merge.removed,
      changed: merge.changed,
    };
  } catch (e) {
    // Sync is a convenience layered on top of a collection that already works.
    // It must never surface an error, and never leave the local list worse than
    // it found it.
    return { synced: false, added: 0, updated: 0, removed: 0, changed: false };
  }
}
