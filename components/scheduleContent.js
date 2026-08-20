import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './apiBase';

// Loader for the per-GROUP care calendar ({lang}-schedule.json) - paridade 120%
// (video do concorrente, 20/08). The competitor shows a month-by-month
// fertilising table. We do not have fertilising data PER SPECIES (Kindwise
// never sends it), but the corpus in docs/agronomia has it PER GROUP, with a
// read source behind every line - so the table is honest about being a group
// table, which the competitor never says about its own.
//
// Exactly the same contract as groupContent/manualContent: network first,
// AsyncStorage fallback, English as language fallback, null when nothing is
// available - the card simply does not render, never an error and never an
// invented row.
const memory = {};

export async function getSchedules(lang) {
  const code = lang || 'en';
  if (memory[code]) return memory[code];

  const cacheKey = '@naturelens_schedule_' + code;
  let data = null;
  try {
    const response = await fetch(`${API_BASE}/locales/${code}-schedule.json`);
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

  if (!data && code !== 'en') return getSchedules('en');
  if (!data) return null;

  memory[code] = data;
  AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
  return data;
}

/**
 * Season-by-season rows for one group.
 *
 * Only the groups the corpus can actually sustain a seasonal table for are in
 * the file. The animal groups have no watering/feeding/pruning at all, and the
 * two commercial crop groups are explicit that the decision is by COUNTING and
 * by soil tension, "nao por calendario" (lavouras-graos-e-cereais.md) - so
 * those return null and the card stays hidden rather than inventing a season.
 *
 * @returns {Array<{activity, spring, summer, autumn, winter, note?}>|null}
 */
export async function getGroupSchedule(groupKey, lang) {
  if (!groupKey) return null;
  const all = await getSchedules(lang);
  const rows = all?.[groupKey]?.rows;
  return Array.isArray(rows) && rows.length ? rows : null;
}
