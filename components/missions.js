import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATEGORY_LIST } from './categories';

// Daily missions - the retention mechanic ported (as a concept, not as code)
// from Cosmic Guide's missions system: three small goals that rotate every
// day and pay tokens, giving a reason to open the app today rather than
// someday.
//
// Design constraints carried over from that app's hard-won rules:
//   - Missions must be COMPLETABLE with what the app actually does today.
//     No "identify a bird by sound" mission when sound ID doesn't exist.
//   - Rewards go through the same tokens balance as everything else - a
//     second currency is complexity with no user upside.
//   - Deterministic by date, not random at runtime: everyone gets the same
//     missions on the same day (shareable, supportable), and reopening the
//     app can never reshuffle a mission someone was halfway through.
//   - All local (AsyncStorage), like the rest of the achievements state.

const STATE_KEY = '@naturelens_missions';

export const TOKENS_PER_MISSION = 10;

// The full mission pool. `target` is how many qualifying events complete it;
// `event` is what recordMissionEvent() must be called with. Text lives in
// i18n under missions.pool.{id}.title - only mechanics live here.
const POOL = [
  { id: 'scanAny2', event: 'scan', target: 2 },
  { id: 'scanAny3', event: 'scan', target: 3 },
  { id: 'scanPlant', event: 'scan', target: 1, category: 'plant' },
  { id: 'scanInsect', event: 'scan', target: 1, category: 'insect' },
  { id: 'scanMushroom', event: 'scan', target: 1, category: 'mushroom' },
  { id: 'scanFish', event: 'scan', target: 1, category: 'fish' },
  { id: 'scanBird', event: 'scan', target: 1, category: 'bird' },
  { id: 'saveOne', event: 'save', target: 1 },
  { id: 'saveTwo', event: 'save', target: 2 },
  { id: 'shareOne', event: 'share', target: 1 },
  { id: 'openDiscover', event: 'discover', target: 1 },
];

function todayLocalDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Deterministic small hash so the same date picks the same missions for
// everyone, with no stored schedule to migrate.
function dateSeed(dateStr) {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Three missions for the given date: always one generic scan mission, one
// category mission (only from categories that are actually enabled), and one
// non-scan mission - a spread that can't produce "scan 3 / scan 2 / scan a
// plant" all at once.
function missionsForDate(dateStr) {
  const seed = dateSeed(dateStr);
  const enabledKeys = new Set(CATEGORY_LIST.map((c) => c.key));

  const generic = POOL.filter((m) => m.event === 'scan' && !m.category);
  const categoric = POOL.filter((m) => m.event === 'scan' && m.category && enabledKeys.has(m.category));
  const other = POOL.filter((m) => m.event !== 'scan');

  return [
    generic[seed % generic.length],
    categoric[(seed >> 3) % categoric.length],
    other[(seed >> 6) % other.length],
  ];
}

async function getState() {
  const today = todayLocalDateString();
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.date === today) return parsed;
  } catch {}
  // New day - fresh missions, zero progress. Yesterday's incomplete missions
  // simply expire; there is no backfill, which is what makes them daily.
  return { date: today, progress: {}, rewarded: {} };
}

async function setState(state) {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}

// The read model for the UI: today's three missions with live progress.
export async function getTodaysMissions() {
  const state = await getState();
  const missions = missionsForDate(state.date);
  return missions.filter(Boolean).map((m) => {
    const done = state.progress[m.id] || 0;
    return {
      ...m,
      done: Math.min(done, m.target),
      completed: done >= m.target,
      rewarded: Boolean(state.rewarded[m.id]),
    };
  });
}

// Called from the places where the qualifying things actually happen (scan
// success, collection save, share, opening Discover). Returns the ids of
// missions completed by THIS event so the caller can award tokens exactly
// once - the `rewarded` map is what makes that idempotent across double
// calls or re-renders.
export async function recordMissionEvent(event, { category } = {}) {
  const state = await getState();
  const missions = missionsForDate(state.date).filter(Boolean);
  const newlyCompleted = [];

  for (const m of missions) {
    if (m.event !== event) continue;
    if (m.category && m.category !== category) continue;
    const before = state.progress[m.id] || 0;
    if (before >= m.target) continue;
    const after = before + 1;
    state.progress[m.id] = after;
    if (after >= m.target && !state.rewarded[m.id]) {
      state.rewarded[m.id] = true;
      newlyCompleted.push(m.id);
    }
  }

  await setState(state);
  return newlyCompleted;
}

export async function clearMissions() {
  try {
    await AsyncStorage.removeItem(STATE_KEY);
  } catch {}
}
