import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './apiBase';
import { canonicalTopicKey } from './topicKey';
import { normaliseAppLanguage } from './appLanguage';

// Loader for the per-topic editorial manual ({lang}-manual.json) - the deep
// "conselhos fundamentais / sinais de problemas / solucoes" content that fills
// each manual tab, written once per language and served as a static file
// (same scaling model as the herbs/species content: CDN-cached, zero compute
// per user, which is the honest answer to "e com milhares de clientes?").
//
// Same resilience contract as the locale loader: network first, AsyncStorage
// copy of the SAME language as offline fallback, and null when neither exists.
// Fetching English here would mix two languages on one screen; the absent
// editorial layer is safer and follows the app's missing-data contract.
const memory = {};

async function fetchManual(lang) {
  const response = await fetch(`${API_BASE}/locales/${lang}-manual.json`);
  if (!response.ok) throw new Error('manual ' + lang + ' ' + response.status);
  return response.json();
}

export async function getManual(lang) {
  const code = normaliseAppLanguage(lang);
  if (memory[code]) return memory[code];

  const cacheKey = '@naturelens_manual_' + code;
  let data = null;
  try {
    data = await fetchManual(code);
  } catch (e) {
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) data = JSON.parse(cached);
    } catch (e2) {
      data = null;
    }
  }

  if (!data) return null;

  memory[code] = data;
  AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
  return data;
}

// A chave visivel varia entre fornecedores, mas o manual e o dossie precisam
// abrir o mesmo assunto. A canonicalizacao compartilhada impede que o card
// prometa `uses` e a tela aberta procure `edible`, como acontecia com lavoura.
export function manualKeyFor(topicKey) {
  return canonicalTopicKey(topicKey);
}

/** Manual entry for one topic key ('watering', 'light', ...) or null. */
export async function getTopicManual(topicKey, lang) {
  const manual = await getManual(lang);
  return manual?.[topicKey] || null;
}
