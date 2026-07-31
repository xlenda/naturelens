import AsyncStorage from '@react-native-async-storage/async-storage';

// Ownership of one-time rewards from the token store (see components/rewards.js
// for the catalogue and components/streakShield.js for the one repeatable item).
//
// Ported from Cosmic Guide's lib/cosmeticRewards.js. Separated from the
// catalogue on purpose: the catalogue describes WHAT is for sale, this records
// WHAT THIS DEVICE OWNS. Repeatable rewards never come through here - they keep
// their own counter, because "owned: true" cannot represent a stack of three.
//
// Local-only, matching the rest of the achievements/tokens state: no server, no
// cross-device sync. Cleared alongside everything else on account deletion.
const OWNED_KEY = '@naturelens_rewards_owned'; // { [rewardId]: true }

export async function getOwnedRewards() {
  try {
    const raw = await AsyncStorage.getItem(OWNED_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function hasReward(id) {
  const owned = await getOwnedRewards();
  return !!owned[id];
}

export async function grantReward(id) {
  try {
    const owned = await getOwnedRewards();
    owned[id] = true;
    await AsyncStorage.setItem(OWNED_KEY, JSON.stringify(owned));
  } catch {}
}

export async function clearRewards() {
  try {
    await AsyncStorage.removeItem(OWNED_KEY);
  } catch {}
}
