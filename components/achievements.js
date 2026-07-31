import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCollection } from './storage';
import { CATEGORY_LIST } from './categories';
import { getShieldCount, consumeShieldIfAvailable } from './streakShield';

const STATE_KEY = '@naturelens_achievements';

// "Tokens" - an earned currency, local-only for now like the rest of this
// state. Per Lenda: tokens are the thing earned per identification: "com
// esses tokens ele pode trocar no futuro por sementes, ou alguma concha ou
// pedra" - i.e. tokens are the currency, seeds/shells/stones are just
// brainstormed EXAMPLES of a future redemption catalog, not the currency's
// name. No redemption catalog exists yet (deliberately deferred); this only
// builds the earning half so the balance is already accruing honestly by
// the time a redemption feature ships, rather than starting everyone at
// zero right when it matters.
export const TOKENS_PER_IDENTIFICATION = 5;
export const TOKENS_PER_ACHIEVEMENT = 15;

const EMPTY_STATE = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null, // 'YYYY-MM-DD', device-local date
  totalIdentifications: 0,
  hasShared: false,
  tokens: 0,
  unlocked: {}, // { [achievementId]: isoTimestamp }
};

// Local-only, same philosophy as the rest of this app's personal stats (see
// project memory) - no accounts, no server round-trip, no sync across
// devices. Icons are Ionicons names; title/body text lives in i18n under
// `achievements.{id}.title`/`body`.
export const ACHIEVEMENT_LIST = [
  { id: 'firstScan', icon: 'sparkles' },
  { id: 'collector10', icon: 'albums' },
  { id: 'collector50', icon: 'trophy' },
  { id: 'collector100', icon: 'ribbon' },
  { id: 'allCategories', icon: 'compass' },
  { id: 'streak3', icon: 'flame' },
  { id: 'streak7', icon: 'flame' },
  { id: 'streak30', icon: 'flame' },
  { id: 'sharedFirst', icon: 'share-social' },
  { id: 'subscriber', icon: 'star' },
];

function todayLocalDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(dateStrA, dateStrB) {
  const [ay, am, ad] = dateStrA.split('-').map(Number);
  const [by, bm, bd] = dateStrB.split('-').map(Number);
  const a = new Date(ay, am - 1, ad);
  const b = new Date(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

async function getState() {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (!raw) return { ...EMPTY_STATE, unlocked: {} };
    const parsed = JSON.parse(raw);
    // One-time migration: this field was briefly called `seeds` (same
    // meaning, renamed to `tokens` per Lenda's clarification) - carry over
    // anything already earned under the old name instead of silently
    // zeroing it out.
    const tokens = parsed.tokens ?? parsed.seeds ?? 0;
    return { ...EMPTY_STATE, ...parsed, tokens, unlocked: { ...parsed.unlocked } };
  } catch (e) {
    return { ...EMPTY_STATE, unlocked: {} };
  }
}

async function setState(state) {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (e) {
    // ignore
  }
}

// Called once per successful identification (IdentifyScreen), regardless of
// whether the result is ever saved to the collection - this is what drives
// the streak and the "first identification" milestone. A day only advances
// the streak once even with multiple scans on the same date.
export async function recordIdentification() {
  const state = await getState();
  const today = todayLocalDateString();
  if (state.lastActiveDate !== today) {
    const gap = state.lastActiveDate ? daysBetween(state.lastActiveDate, today) : null;
    let isConsecutive = gap === 1;
    // Exactly one missed day can be forgiven by a Streak Shield bought in the
    // Rewards store. This is the ONLY place a shield is ever spent - reading
    // the streak elsewhere merely peeks at the count (see getStreakInfo), so a
    // user who never scans again never silently burns the shield they paid for.
    // A gap of 3+ days is a real break: no shield covers it.
    if (gap === 2 && (await consumeShieldIfAvailable())) {
      isConsecutive = true;
    }
    state.currentStreak = isConsecutive ? state.currentStreak + 1 : 1;
    state.longestStreak = Math.max(state.longestStreak, state.currentStreak);
    state.lastActiveDate = today;
  }
  state.totalIdentifications += 1;
  state.tokens += TOKENS_PER_IDENTIFICATION;
  await setState(state);
}

// Spends tokens if the balance covers it. Returns true when the debit actually
// happened, false when it didn't - callers MUST check the return value before
// granting anything, or a user could redeem without paying.
//
// Re-reads state immediately before writing rather than trusting a balance the
// caller already had on screen, so a stale screen can't overdraw the wallet.
// Credits tokens earned outside the two built-in triggers (used by daily
// missions). Same re-read-before-write discipline as spendTokens.
export async function addTokens(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const state = await getState();
  state.tokens += amount;
  await setState(state);
}

export async function spendTokens(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const state = await getState();
  if (state.tokens < amount) return false;
  state.tokens -= amount;
  await setState(state);
  return true;
}

export async function recordShare() {
  const state = await getState();
  if (!state.hasShared) {
    state.hasShared = true;
    await setState(state);
  }
}

// The stored currentStreak is only ever advanced/reset lazily on the next
// identification, so a streak that's actually already broken (2+ days of
// inactivity) would otherwise still read as its old nonzero value until the
// user scans again - correct for that here, at read time, rather than
// needing a background job.
export async function getStreakInfo() {
  const state = await getState();
  const today = todayLocalDateString();
  const shields = await getShieldCount();
  let currentStreak = state.currentStreak;
  let shieldWillCover = false;

  if (!state.lastActiveDate) {
    currentStreak = 0;
  } else if (state.lastActiveDate !== today) {
    const gap = daysBetween(state.lastActiveDate, today);
    if (gap === 2 && shields > 0) {
      // A shield WOULD cover this gap, but is deliberately not spent here:
      // this function is a read, and reads run on every screen focus. Spending
      // on read would burn the shield repeatedly just from opening the app, and
      // would charge a user who never comes back to scan at all. The actual
      // debit happens in recordIdentification(). Reporting the streak as alive
      // is honest - it IS what the user will get on their next scan.
      shieldWillCover = true;
    } else if (gap > 1) {
      currentStreak = 0;
    }
  }

  return {
    currentStreak,
    longestStreak: state.longestStreak,
    totalIdentifications: state.totalIdentifications,
    tokens: state.tokens,
    shields,
    shieldWillCover,
  };
}

// Re-evaluates every achievement against current data and persists/returns
// any newly crossed ones. Cheap enough to call on every identification and
// on every focus of the Identify/Achievements/Profile screens - collector
// and category-diversity achievements are derived from the collection
// itself rather than tracked as separate events, so they're picked up
// whenever this next runs after a save, not necessarily the instant it
// happens.
export async function evaluateAchievements({ subStatus } = {}) {
  const state = await getState();
  const collection = await getCollection();
  const categoriesSaved = new Set(collection.map((item) => item.category));

  const met = {
    firstScan: state.totalIdentifications >= 1,
    collector10: collection.length >= 10,
    collector50: collection.length >= 50,
    collector100: collection.length >= 100,
    allCategories: CATEGORY_LIST.every((c) => categoriesSaved.has(c.key)),
    streak3: state.longestStreak >= 3,
    streak7: state.longestStreak >= 7,
    streak30: state.longestStreak >= 30,
    sharedFirst: state.hasShared,
    subscriber: subStatus === 'active',
  };

  const unlocked = { ...state.unlocked };
  const newlyUnlocked = [];
  ACHIEVEMENT_LIST.forEach(({ id }) => {
    if (met[id] && !unlocked[id]) {
      unlocked[id] = new Date().toISOString();
      newlyUnlocked.push(id);
    }
  });

  if (newlyUnlocked.length > 0) {
    const tokens = state.tokens + newlyUnlocked.length * TOKENS_PER_ACHIEVEMENT;
    await setState({ ...state, unlocked, tokens });
  }

  return { newlyUnlocked, unlocked };
}

export async function clearAchievements() {
  try {
    await AsyncStorage.removeItem(STATE_KEY);
  } catch (e) {
    // ignore
  }
}
