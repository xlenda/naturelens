import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';

const KEY = '@naturelens_store_review_v1';
const REQUIRED_POSITIVE_SIGNALS = 2;

let queue = Promise.resolve();

function safeState(value) {
  return {
    version: 1,
    positiveSignals: Number.isInteger(value?.positiveSignals)
      ? Math.max(0, value.positiveSignals)
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

async function recordSignal() {
  const current = await readState();
  if (current.requestedAt) return false;

  const next = {
    ...current,
    positiveSignals: current.positiveSignals + 1,
  };
  if (next.positiveSignals < REQUIRED_POSITIVE_SIGNALS) {
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
    // Marca antes de abrir: o sistema pode decidir nao exibir a caixa e nao
    // existe retorno confiavel. Repetir a cada toque seria assedio, nao retencao.
    const requested = { ...next, requestedAt: new Date().toISOString() };
    if (!(await writeState(requested))) return false;
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}

export function recordPositiveReviewSignal() {
  const task = queue.then(recordSignal);
  queue = task.catch(() => false);
  return task;
}
