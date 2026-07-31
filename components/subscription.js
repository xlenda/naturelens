import { Platform, Linking } from 'react-native';
import { getDeviceId } from './deviceId';
import { API_BASE } from './apiBase';


// Hotmart replaced Stripe as the payment provider (2026-07-28). Brazilian
// cards could not complete a Stripe checkout at all - a confirmed limitation
// from a real payment test - and Hotmart brings Pix, boleto and local cards.
// The switch was a clean rip-out rather than a migration because the app had
// ZERO Stripe subscribers, so there was no installed base to protect.
//
// The architectural consequence to keep in mind everywhere below: Hotmart
// checkout happens on THEIR page, so no device id travels with the purchase.
// Access is granted by the webhook against the buyer's EMAIL, and the buyer
// links it to this device afterwards through the existing email-OTP restore
// flow (Profile -> Restore access). That flow is the bridge; it is not
// optional plumbing.

// Three plans, matching the offers configured in the Hotmart product.
// Display-only: these numbers must be kept in step by hand with what is
// actually configured at Hotmart - nothing is fetched dynamically.
export const PLAN_PRICES = { monthly: 5, quarterly: 12, annual: 39 };

export const PLAN_ORDER = ['monthly', 'quarterly', 'annual'];

// How many months each plan covers - used to compute the honest "save X%"
// badge against the monthly price instead of hardcoding a percentage that can
// drift away from the real prices.
export const PLAN_MONTHS = { monthly: 1, quarterly: 3, annual: 12 };

export function getPlanSavingPercent(plan) {
  const months = PLAN_MONTHS[plan];
  if (!months || months === 1) return 0;
  const full = PLAN_PRICES.monthly * months;
  if (!full) return 0;
  return Math.round((1 - PLAN_PRICES[plan] / full) * 100);
}

// Kept so existing GTM/tracking call sites don't need to change.
export function getPlanCurrency() {
  return 'usd';
}

// Hotmart checkout links, one per offer, injected at BUILD time.
//
// EXPO_PUBLIC_* is the only env prefix Expo exposes to the client bundle. These
// are public checkout URLs, not secrets - the secret half of Hotmart (the
// webhook token) lives server-side in HOTMART_HOTTOK and never reaches here.
const CHECKOUT_LINKS = {
  monthly: process.env.EXPO_PUBLIC_HOTMART_LINK_MONTHLY || '',
  quarterly: process.env.EXPO_PUBLIC_HOTMART_LINK_QUARTERLY || '',
  annual: process.env.EXPO_PUBLIC_HOTMART_LINK_ANNUAL || '',
};

export function getCheckoutLink(plan) {
  return CHECKOUT_LINKS[plan] || '';
}

// True only when every plan has a link configured. The paywall uses this to
// avoid showing a Subscribe button that would go nowhere - a dead button on a
// payment screen is worse than an honest "coming soon".
export function isCheckoutConfigured() {
  return PLAN_ORDER.every((p) => Boolean(CHECKOUT_LINKS[p]));
}

export async function startCheckout(plan = 'monthly') {
  const url = getCheckoutLink(plan);
  if (!url) {
    throw new Error('Checkout is not configured yet.');
  }

  if (Platform.OS === 'web') {
    if (window.dataLayer) {
      window.dataLayer.push({
        event: 'begin_checkout',
        plan,
        currency: 'USD',
        value: PLAN_PRICES[plan],
      });
    }
    // Remembered so the conversion event on return can report which plan was
    // bought. Hotmart hands the returning browser nothing to look the purchase
    // up with, so without this the funnel would only ever see "someone paid".
    try {
      window.sessionStorage?.setItem('naturelens_checkout_plan', plan);
    } catch (e) {
      // private mode - tracking is never allowed to block a purchase
    }
    // Hotmart's checkout is a full page on their domain, so this leaves the
    // app. The user returns manually and restores access by email.
    window.location.href = url;
  } else {
    await Linking.openURL(url);
  }
}

// The account e-mail linked to this device, learned as a side effect of the
// status call the Profile already makes.
//
// Kept in memory rather than persisted: it is server state, and a stale copy
// surviving in storage after an account was unlinked would show someone a
// signed-in header for an account they no longer have. Losing it on reload just
// means the next status call fills it in again.
let lastKnownEmail = null;

/** @returns the signed-in e-mail, or null. Only meaningful after
 *  getSubscriptionStatus() has run at least once. */
export function getLinkedEmail() {
  return lastKnownEmail;
}

export async function getSubscriptionStatus() {
  try {
    const deviceId = await getDeviceId();
    const response = await fetch(
      `${API_BASE}/api/subscription-status?deviceId=${encodeURIComponent(deviceId)}`
    );

    // Three states, never two. A transient failure (429 rate limit behind a
    // shared IP, a timeout, an offline moment) must read as "don't know", not
    // as "not subscribed" - the two-state version of this revoked paying
    // customers and burned their free allowance permanently.
    if (response.status === 429 || response.status === 408 || response.status >= 500) {
      return undefined; // unknown
    }
    if (!response.ok) return null;

    const data = await response.json();
    lastKnownEmail = data.email || null;
    return data.status || null;
  } catch (e) {
    return undefined; // network failure is "don't know", not "no access"
  }
}

// After returning from Hotmart, access depends on their webhook having landed
// AND on the buyer having linked their email to this device. Polling briefly
// covers the webhook race; the email linking is a deliberate user action.
export async function pollSubscriptionStatus(maxAttempts = 6, delayMs = 1500) {
  let status = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await getSubscriptionStatus();
    if (result === 'active') return result;
    if (result !== undefined) status = result;
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return status;
}
