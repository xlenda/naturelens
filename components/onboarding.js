import AsyncStorage from '@react-native-async-storage/async-storage';

// Whether the first-run introduction has been shown.
//
// Deliberately a single boolean and nothing else: an onboarding that tracks
// partial progress ("you stopped on slide 2") invites re-showing it, and a
// second showing of an intro is worse than never showing one.
const KEY = '@naturelens_onboarding_seen';
const replayListeners = new Set();

export async function hasSeenOnboarding() {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true';
  } catch {
    // A storage failure must never trap someone in an endless intro loop:
    // treat "cannot read" as "already seen" and let them into the app.
    return true;
  }
}

export async function markOnboardingSeen() {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch {}
}

export async function clearOnboarding() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

export async function requestOnboardingReplay() {
  await clearOnboarding();
  replayListeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

export function subscribeOnboardingReplay(listener) {
  replayListeners.add(listener);
  return () => replayListeners.delete(listener);
}
