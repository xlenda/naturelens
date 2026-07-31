import AsyncStorage from '@react-native-async-storage/async-storage';

// "Streak Shield" - bought with tokens in the Rewards store. This module only
// keeps a count; the decision of WHEN to spend one belongs to
// components/achievements.js, at the moment it finds a gap in the streak.
//
// Ported from Cosmic Guide's lib/streakShield.js. Same shape, different key
// prefix so the two apps never collide if both are ever installed as PWAs on
// the same browser profile.
const SHIELD_COUNT_KEY = '@naturelens_streak_shields';

export async function getShieldCount() {
  try {
    const raw = await AsyncStorage.getItem(SHIELD_COUNT_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function addShield() {
  const next = (await getShieldCount()) + 1;
  try {
    await AsyncStorage.setItem(SHIELD_COUNT_KEY, String(next));
  } catch {}
  return next;
}

// Consumes one shield if any are stored. Returns true when one was actually
// spent - the caller should then treat the missed day as if it had activity.
export async function consumeShieldIfAvailable() {
  const count = await getShieldCount();
  if (count <= 0) return false;
  try {
    await AsyncStorage.setItem(SHIELD_COUNT_KEY, String(count - 1));
  } catch {}
  return true;
}

export async function clearShields() {
  try {
    await AsyncStorage.removeItem(SHIELD_COUNT_KEY);
  } catch {}
}
