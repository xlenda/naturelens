import { Platform } from 'react-native';
import { getDeviceId } from './deviceId';
import { API_BASE } from './apiBase';

// Web Push for the PWA.
//
// This is the only way this app can send a reminder without shipping a native
// build, and it genuinely works on both platforms today:
//   - Android/Chrome: works in a normal tab.
//   - iOS 16.4+: works ONLY when the PWA was added to the home screen.
//     Calling Notification.requestPermission() in a Safari TAB does nothing at
//     all - no prompt, no error - so asking there just teaches the user the
//     button is broken. Hence the standalone check below.
//
// Everything degrades quietly: no support, no permission, no server config -
// the UI simply never offers it, rather than offering something that fails.


// Public half of the VAPID pair. Public by design - it is sent to the browser's
// push service to identify this application server. The private half lives only
// in the VAPID_PRIVATE_KEY env var, server-side.
const VAPID_PUBLIC_KEY =
  'BDhSAC4Inlgd3cKXNpdVBo7FRwSDtwO5-Yj7r4u0RKbXEuCYppWIClPhrY0E9c2X5M2I5g2rQyL_cIV3bPUK2bA';

function urlBase64ToUint8Array(base64String) {
  // The subscribe() API wants raw bytes, not the base64url string.
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function isStandalone() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator?.standalone === true
  );
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// Whether it is worth SHOWING the enable-notifications control at all.
export function canUsePush() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  if (!('Notification' in window)) return false;
  // On iOS the whole API exists in a tab but is inert until installed.
  if (isIOS() && !isStandalone()) return false;
  return true;
}

export function getPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/**
 * Asks for permission, subscribes, and registers the subscription with the
 * backend. Returns 'granted' | 'denied' | 'unsupported' | 'error'.
 *
 * Must be called from a real user gesture - browsers reject a permission
 * request that did not come from a click.
 */
export async function enablePush() {
  if (!canUsePush()) return 'unsupported';

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission; // 'denied' or 'default'

    const registration = await navigator.serviceWorker.ready;

    // Reuse an existing subscription rather than creating a second one for the
    // same browser - duplicates mean the same person gets every push twice.
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        // Required to be true by Chrome: a push must always show something.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const deviceId = await getDeviceId();
    const resp = await fetch(`${API_BASE}/api/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'subscribe',
        deviceId,
        subscription: subscription.toJSON(),
        language: typeof navigator !== 'undefined' ? navigator.language : null,
        timezoneOffset: new Date().getTimezoneOffset(),
      }),
    });

    if (!resp.ok) return 'error';
    return 'granted';
  } catch (e) {
    return 'error';
  }
}

export async function disablePush() {
  if (!canUsePush()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    const deviceId = await getDeviceId();
    // Tell the server FIRST, then unsubscribe locally: if the order were
    // reversed and the request failed, the server would keep pushing to an
    // endpoint that no longer exists.
    await fetch(`${API_BASE}/api/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unsubscribe', deviceId, endpoint: subscription.endpoint }),
    }).catch(() => {});

    await subscription.unsubscribe();
    return true;
  } catch (e) {
    return false;
  }
}

export async function isPushEnabled() {
  if (!canUsePush() || getPermission() !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(await registration.pushManager.getSubscription());
  } catch (e) {
    return false;
  }
}
