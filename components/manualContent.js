import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './apiBase';

// Loader for the per-topic editorial manual ({lang}-manual.json) - the deep
// "conselhos fundamentais / sinais de problemas / solucoes" content that fills
// each manual tab, written once per language and served as a static file
// (same scaling model as the herbs/species content: CDN-cached, zero compute
// per user, which is the honest answer to "e com milhares de clientes?").
//
// Same resilience contract as the locale loader: network first, AsyncStorage
// copy as offline fallback, English as language fallback, and a null return
// when nothing is available - the tab then simply shows the species text
// alone, never an error.
const memory = {};

async function fetchManual(lang) {
  const response = await fetch(`${API_BASE}/locales/${lang}-manual.json`);
  if (!response.ok) throw new Error('manual ' + lang + ' ' + response.status);
  return response.json();
}

export async function getManual(lang) {
  const code = lang || 'en';
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

  if (!data && code !== 'en') return getManual('en');
  if (!data) return null;

  memory[code] = data;
  AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
  return data;
}

// Duas abas da tela de manual nao tem verbete proprio e emprestam o de outra:
// 'confusas' (especies parecidas) le o de seguranca e 'overview' le o de papel
// ecologico. Isso vivia como um ternario solto dentro do CareTopicsScreen; virou
// funcao quando o carrossel de Problemas Comuns passou a precisar do MESMO
// mapeamento para navegar de volta pra aba certa - paridade 120% (video do
// concorrente, 20/08). Duas copias desse ternario sairiam de sincronia na
// primeira aba nova.
export function manualKeyFor(topicKey) {
  if (topicKey === 'confusas') return 'safety';
  if (topicKey === 'overview') return 'role';
  return topicKey;
}

/** Manual entry for one topic key ('watering', 'light', ...) or null. */
export async function getTopicManual(topicKey, lang) {
  const manual = await getManual(lang);
  return manual?.[topicKey] || null;
}
