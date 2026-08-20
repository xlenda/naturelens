import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './apiBase';

// Loader for the per-GROUP manual ({lang}-groups.json) - the layer the owner
// asked for: "cacto precisa regar menos do que uma planta frutifera". The
// universal manual carries the technique that is true for everything; this
// one carries what changes by TYPE (succulents vs ferns vs fruit crops;
// pollinators vs pest insects; freshwater vs marine fish).
//
// Same contract as manualContent: network first, AsyncStorage fallback,
// English as language fallback, null when nothing is available - the tab
// then shows species text + universal manual only, never an error.
const memory = {};

export async function getGroups(lang) {
  const code = lang || 'en';
  if (memory[code]) return memory[code];

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

  if (!data && code !== 'en') return getGroups('en');
  if (!data) return null;

  memory[code] = data;
  AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
  return data;
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
  return { label: group.label, advice: topic.advice || [], checklist: topic.checklist || [] };
}
