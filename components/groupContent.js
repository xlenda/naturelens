import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './apiBase';
import { getAgronomySources } from './agronomySources';
import { normaliseAppLanguage } from './appLanguage';

// Loader for the per-GROUP manual ({lang}-groups.json) - the layer the owner
// asked for: "cacto precisa regar menos do que uma planta frutifera". The
// universal manual carries the technique that is true for everything; this
// one carries what changes by TYPE (succulents vs ferns vs fruit crops;
// pollinators vs pest insects; freshwater vs marine fish).
//
// Rede primeiro, cache local do MESMO idioma depois. Sem os dois, devolve null:
// o bloco some em vez de misturar ingles no meio da interface.
const memory = {};
const pending = {};

export async function getGroups(lang) {
  const code = normaliseAppLanguage(lang);
  if (memory[code]) return memory[code];
  if (pending[code]) return pending[code];

  const load = async () => {
    const cacheKey = '@naturelens_groups_' + code;
    let data = null;
    try {
      const response = await fetch(`${API_BASE}/locales/${code}-groups.json`);
      if (response.ok) data = await response.json();
    } catch (e) {
      data = null;
    }
    if (!data) {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) data = JSON.parse(cached);
      } catch (e) {
        data = null;
      }
    }

    if (!data) return null;

    memory[code] = data;
    AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
    return data;
  };

  const promise = load();
  pending[code] = promise;
  try {
    return await promise;
  } finally {
    if (pending[code] === promise) delete pending[code];
  }
}

/**
 * Group-specific manual for one topic.
 * @returns { label, advice[], checklist[] } or null when the species has no
 *          recognised group, or the group has nothing to say on this topic.
 */
export async function getGroupTopic(groupKey, topicKey, lang) {
  if (!groupKey || !topicKey) return null;
  const groups = await getGroups(lang);
  const group = groups?.[groupKey];
  const topic = group?.topics?.[topicKey];
  if (!topic) return null;
  return {
    label: group.label,
    advice: topic.advice || [],
    checklist: topic.checklist || [],
    sources: getAgronomySources(groupKey, topicKey),
  };
}
