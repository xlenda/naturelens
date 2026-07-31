const crypto = require('crypto');

// Hotmart webhook parsing, adapted from the Cosmic Guide implementation.
//
// That version was written AFTER a real incident: 100% of approved purchases
// were silently rejected for the entire life of the product, because the code
// read fields at paths the real payload does not have. Every comment below
// marked "incidente real" is a bug that actually happened with real money -
// none of it is defensive theory, and none of it should be "simplified" away.

// Our own correlation code format, if we ever send one (crypto 16 bytes hex).
// Used to tell OUR code apart from a marketing tracking param that arrives in
// the same `origin` object - "utm-facebook" must never be read as a
// subscription correlation.
const CORRELATION_CODE_RE = /^[a-f0-9]{32}$/i;

// Hotmart sends dates in TWO formats depending on field and event version:
// an ISO string, or epoch in MILLISECONDS (confirmed against a real production
// payload). A readable string is returned untouched; a number becomes ISO.
function epochToIso(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  // Below 1e12 can only be epoch SECONDS (1e12 ms is already the year 2001).
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toIsoDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return epochToIso(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return epochToIso(Number(trimmed));
    return trimmed;
  }
  return null;
}

function firstNonEmptyString(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

// First price object with a value > 0. During a trial all of them come back as
// zero - in that case return zero honestly (it IS what was charged now) and let
// the caller decide whether to keep the plan price instead.
function pickPrice(purchase) {
  const candidates = [purchase?.price, purchase?.full_price, purchase?.original_offer_price];
  for (const c of candidates) {
    if (c && typeof c.value === 'number' && c.value > 0) return c;
  }
  for (const c of candidates) {
    if (c && typeof c.value === 'number') return c;
  }
  return null;
}

// Constant-time comparison so the webhook token cannot be recovered by timing
// the response. A plain === leaks the secret character by character.
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still burn a comparison of equal length so the mismatch-length case
    // doesn't return measurably faster than a mismatch-content case.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Maps Hotmart's events/status onto our vocabulary.
function normalizeStatus({ event, subscriptionStatus }) {
  // INCIDENTE REAL: money-returned events take precedence over ANY subscription
  // status in the same payload. On a refund, Hotmart very often still sends
  // subscription.status = "ACTIVE" (the subscription object describes the plan,
  // not the purchase). Reading status first meant a refund returned "active"
  // and NEVER revoked access - the customer got their money back and kept using
  // the product.
  if (event === 'PURCHASE_REFUNDED' || event === 'PURCHASE_CHARGEBACK') return 'expired';

  // SUBSCRIPTION_CANCELLATION belongs in the SAME precedence block, and leaving
  // it out was the identical bug wearing a different hat (found by adversarial
  // review 2026-07-29, before any real sale): this event also arrives carrying
  // subscription.status = "ACTIVE", so it fell through to the ACTIVE check
  // below, was normalised to 'active', and the dedicated handling further down
  // was unreachable. Someone who cancelled kept full access forever, burning
  // paid Plant.id/Fishial/Nyckel credits.
  //
  // PURCHASE_CANCELED deliberately does NOT pre-empt: that is a single charge
  // being voided, which should not end a subscription that is still running.
  if (event === 'SUBSCRIPTION_CANCELLATION') return 'canceled';
  if (event === 'PURCHASE_EXPIRED') return 'expired';

  if (subscriptionStatus === 'ACTIVE') return 'active';
  if (subscriptionStatus === 'STARTED') return 'active';
  if (subscriptionStatus === 'OVERDUE' || subscriptionStatus === 'DELAYED') return 'past_due';
  if (
    subscriptionStatus === 'CANCELLED_BY_CUSTOMER' ||
    subscriptionStatus === 'CANCELLED_BY_SELLER' ||
    subscriptionStatus === 'CANCELLED_BY_ADMIN'
  ) {
    return 'canceled';
  }
  if (event === 'PURCHASE_APPROVED' || event === 'PURCHASE_COMPLETE') return 'active';
  if (event === 'PURCHASE_CANCELED') return 'canceled';
  return null;
}

function verifyWebhookSignature(headers) {
  const expected = process.env.HOTMART_HOTTOK?.trim();
  if (!expected) return false;
  const received =
    headers['x-hotmart-hottok'] || headers['X-HOTMART-HOTTOK'] || headers['x-hotmart-hottok'.toUpperCase()];
  return Boolean(received) && timingSafeEqual(String(received), expected);
}

function parseWebhookEvent(payload) {
  const event = payload?.event || null;
  const data = payload?.data || {};
  const purchase = data.purchase || {};
  const subscription = data.subscription || {};
  const buyer = data.buyer || {};
  // SUBSCRIPTION_CANCELLATION uses data.subscriber instead of data.buyer.
  const subscriber = data.subscriber || subscription.subscriber || {};

  // xcod only arrives on the LINK checkout flow. `origin.src` is the same field
  // used for campaign tracking, so only accept it when it has exactly our own
  // correlation-code shape.
  const origin = purchase.origin || subscription.origin || {};
  const rawXcod = firstNonEmptyString(origin.xcod, data.xcod, purchase.xcod);
  const rawSrc = firstNonEmptyString(origin.src, purchase.src);
  const correlationCode =
    rawXcod || (rawSrc && CORRELATION_CODE_RE.test(rawSrc) ? rawSrc : null) || null;

  const status = normalizeStatus({ event, subscriptionStatus: subscription.status });
  const price = pickPrice(purchase);

  // The subscriber code is the STABLE identifier of the subscription at Hotmart
  // and is what future renewals, delays and cancellations will carry.
  //
  // NEVER fall back to the transaction id here. That is a tempting and wrong
  // shortcut: events that arrive BEFORE a payment exists (boleto/PIX printed,
  // abandoned cart, delayed) carry no subscriber code, so they would stamp the
  // subscription row with a transaction id - and the real PURCHASE_APPROVED,
  // arriving later with the true subscriber code, would no longer find it. That
  // is literally the "paid and got no access" bug coming back through another
  // door. The transaction stays in its own field below and serves as its own
  // rung of the correlation ladder.
  const providerSubscriptionId = firstNonEmptyString(
    subscriber.code,
    subscription.subscriber_code,
    subscription.code
  );

  // Which product was bought. Needed because one Hotmart ACCOUNT can sell
  // several products, and a webhook configured at account level delivers all of
  // them to the same URL. Without this, a purchase of a DIFFERENT product from
  // the same seller would be accepted here and granted NatureLens access.
  const product = data.product || purchase.product || {};

  return {
    productId: firstNonEmptyString(
      product.id != null ? String(product.id) : null,
      product.ucode,
      data.product_id != null ? String(data.product_id) : null
    ),
    // Unique notification id, used to dedupe re-delivery. Hotmart resends when
    // it doesn't get a timely 200, and without this a resend would create a
    // second subscription.
    eventId: payload?.id || null,
    correlationCode,
    status,
    providerSubscriptionId,
    transactionId: firstNonEmptyString(purchase.transaction),
    // Buyer email: the ONLY correlation left when no xcod arrives, which is the
    // normal case for the embedded checkout.
    buyerEmail: firstNonEmptyString(buyer.email, subscriber.email, data.contact?.email),
    buyerName: firstNonEmptyString(buyer.name, subscriber.name),
    amountCents: price && typeof price.value === 'number' ? Math.round(price.value * 100) : null,
    currency: firstNonEmptyString(
      price && price.currency_value,
      purchase.price?.currency_value,
      purchase.full_price?.currency_value,
      purchase.original_offer_price?.currency_value
    ),
    // INCIDENTE REAL: the real value lives in purchase.date_next_charge as epoch
    // MILLISECONDS. Reading subscription.date_next_charge returned undefined on
    // 100% of real events, so current_period_end was never filled in.
    currentPeriodEnd: toIsoDate(
      purchase.date_next_charge != null ? purchase.date_next_charge : subscription.date_next_charge
    ),
    // The offer code identifies WHICH plan was bought (monthly/quarterly/annual).
    offerCode: firstNonEmptyString(purchase.offer?.code, subscription.plan?.name, purchase.offer_code),
    eventTime:
      toIsoDate(payload?.creation_date) ||
      toIsoDate(purchase.approved_date) ||
      toIsoDate(purchase.order_date),
    rawEvent: event,
  };
}

// Email hygiene for the correlation ladder. An empty string would match every
// row with a null email, and an address without a proper domain is not usable
// as an identity.
function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!trimmed.includes('@')) return null;
  const domain = trimmed.split('@')[1] || '';
  if (!domain.includes('.')) return null;
  return trimmed;
}

module.exports = {
  verifyWebhookSignature,
  parseWebhookEvent,
  normalizeEmail,
  timingSafeEqual,
};
