import { Linking, Platform } from 'react-native';
import { getDeviceId } from './deviceId';
import { API_BASE } from './apiBase';

// Store prices and products must come from Google Play or App Store at runtime.
// No fallback price or external purchase flow is kept here: showing a stale price is
// worse than honestly keeping sales disabled until native billing is connected.

const MANAGEMENT_URL = {
  android: 'https://play.google.com/store/account/subscriptions?package=app.naturelens',
  ios: 'https://apps.apple.com/account/subscriptions',
};

let lastKnownEmail = null;
let lastPeriodEnd = null;

export function getLinkedEmail() {
  return lastKnownEmail;
}

export function getPeriodEnd() {
  return lastPeriodEnd;
}

export function canManageStoreSubscription() {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

export async function openStoreSubscriptionManagement() {
  const url = MANAGEMENT_URL[Platform.OS];
  if (!url) return false;
  return Linking.openURL(url).then(() => true).catch(() => false);
}

export async function getSubscriptionStatus() {
  try {
    const deviceId = await getDeviceId();
    const response = await fetch(
      `${API_BASE}/api/subscription-status?deviceId=${encodeURIComponent(deviceId)}`
    );

    // Network failure is unknown, never proof that a paying user lost access.
    if (response.status === 429 || response.status === 408 || response.status >= 500) {
      return undefined;
    }
    if (!response.ok) return null;

    const data = await response.json();
    lastKnownEmail = data.email || null;
    lastPeriodEnd = data.currentPeriodEnd || null;
    return data.status || null;
  } catch (e) {
    return undefined;
  }
}
