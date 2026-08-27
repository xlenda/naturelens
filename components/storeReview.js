import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';

const KEY = '@naturelens_store_review_v2';
const REQUIRED_COMPLETED_DISCOVERIES = 3;

let queue = Promise.resolve();

function safeState(value) {
  return {
    version: 2,
    completedDiscoveries: Number.isInteger(value?.completedDiscoveries)
      ? Math.max(0, value.completedDiscoveries)
      : 0,
    requestedAt: typeof value?.requestedAt === 'string' ? value.requestedAt : null,
  };
}

async function readState() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? safeState(JSON.parse(raw)) : safeState(null);
  } catch {
    return safeState(null);
  }
}

async function writeState(value) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

async function recordCompletedDiscovery() {
  const current = await readState();
  if (current.requestedAt) return false;

  const next = {
    ...current,
    completedDiscoveries: current.completedDiscoveries + 1,
  };
  if (next.completedDiscoveries < REQUIRED_COMPLETED_DISCOVERIES) {
    await writeState(next);
    return false;
  }

  if (!['android', 'ios'].includes(Platform.OS)) {
    await writeState(next);
    return false;
  }

  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) {
      await writeState(next);
      return false;
    }
    // O sistema decide se/quando mostra o cartao. Nao fazemos triagem da pessoa
    // e marcamos antes para nunca insistir a cada descoberta.
    const requested = { ...next, requestedAt: new Date().toISOString() };
    if (!(await writeState(requested))) return false;
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}

export function recordReviewEligibleMoment() {
  const task = queue.then(recordCompletedDiscovery);
  queue = task.catch(() => false);
  return task;
}
