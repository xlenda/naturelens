import { Platform } from 'react-native';

// Funnel tracking.
//
// Built because of the single most expensive mistake from the sibling app: it
// was advertised, dozens of people came in, ZERO reached checkout, and there
// was no way to know where they dropped off. Without a funnel, improving the
// app is guesswork - you can only see that it isn't working, never why.
//
// Everything goes into GTM's `dataLayer`, which is the half that needs code.
// Turning these into GA4 / Google Ads conversions is configuration inside the
// GTM panel and cannot be done from here.
//
// Design rules:
//   - Never throw. A tracking failure must never break a scan or a purchase.
//   - Web only. There is no dataLayer in a native build, and silently
//     collecting nothing is better than crashing on a missing global.
//   - No personal data. Category, plan and counts only - never the photo,
//     never the email, never the species someone scanned at home.

const IS_WEB = Platform.OS === 'web';

function push(event, params = {}) {
  if (!IS_WEB) return;
  try {
    if (typeof window === 'undefined' || !window.dataLayer) return;
    window.dataLayer.push({ event, ...params });
  } catch (e) {
    // Tracking is never allowed to surface an error to the user.
  }
}

// ---------------------------------------------------------------------------
// Top of funnel
// ---------------------------------------------------------------------------

// Fired once per session when the app becomes usable. The denominator every
// other rate in the funnel is measured against.
export function trackAppOpen({ language, standalone }) {
  push('app_open', { language, standalone: Boolean(standalone) });
}

export function trackOnboardingCompleted({ steps }) {
  push('onboarding_completed', { steps });
}

// ---------------------------------------------------------------------------
// Core activation: did they actually identify something?
// ---------------------------------------------------------------------------

// A photo was taken/picked and sent. Paired with scan_completed this gives the
// real success rate of the thing the app exists to do.
export function trackScanStarted({ category, source }) {
  push('scan_started', { category, source }); // source: 'camera' | 'library'
}

export function trackScanCompleted({ category, confidence, hasAlternatives }) {
  push('scan_completed', {
    category,
    confidence,
    has_alternatives: Boolean(hasAlternatives),
    // Bucketed so a funnel report can segment "confident" vs "unsure" results
    // without having to handle 100 distinct values.
    confidence_band: confidence >= 85 ? 'high' : confidence >= 65 ? 'medium' : 'low',
  });
}

// `reason` separates the failures that are our problem (api_error) from the
// ones that are the business model working (payment_required) - lumping them
// together hides whether the paywall is converting or the product is broken.
export function trackScanFailed({ category, reason }) {
  push('scan_failed', { category, reason });
}

export function trackResultSaved({ category }) {
  push('result_saved', { category });
}

export function trackResultShared({ category, method }) {
  push('result_shared', { category, method });
}

// ---------------------------------------------------------------------------
// Monetisation
// ---------------------------------------------------------------------------

// The paywall was actually shown. `trigger` is what caused it - free limit hit,
// a locked herb, a voluntary tap in Profile. Without this you cannot tell an
// offer nobody saw from an offer nobody wanted.
export function trackPaywallShown({ trigger, category }) {
  push('paywall_shown', { trigger, category });
}

export function trackPlanSelected({ plan, price }) {
  push('plan_selected', { plan, currency: 'USD', value: price });
}

export function trackPaywallDismissed({ trigger, plan }) {
  push('paywall_dismissed', { trigger, plan });
}

// ---------------------------------------------------------------------------
// Access recovery - the step most likely to lose a paying customer
// ---------------------------------------------------------------------------

// With Hotmart the buyer pays on another site and MUST come back and confirm
// their email to unlock this device. That handoff is the most fragile point in
// the whole flow, so it is measured on its own: someone who paid and never
// completed this is a customer with no product.
export function trackRestoreStarted({ method }) {
  push('restore_started', { method }); // 'code' | 'password' | 'google'
}

export function trackRestoreCompleted({ method, status }) {
  push('restore_completed', { method, status });
}

export function trackRestoreFailed({ method, reason }) {
  push('restore_failed', { method, reason });
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export function trackAchievementUnlocked({ achievementId }) {
  push('achievement_unlocked', { achievement_id: achievementId });
}

export function trackRewardRedeemed({ rewardId, cost }) {
  push('reward_redeemed', { reward_id: rewardId, cost });
}

export function trackInstallPromptAccepted() {
  push('pwa_installed', {});
}
