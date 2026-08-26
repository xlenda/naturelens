// Regression tests for the payment layer.
//
// Every case here is a bug that was REAL in this file's history, found by
// adversarial review on 2026-07-29 before the first sale. They exist so a
// future edit cannot quietly reintroduce them - this is the surface where a
// silent failure means money in and no access, with nothing in any log.
//
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseWebhookEvent, normalizeEmail, timingSafeEqual } = require('./api/_lib/hotmart');

function payload(event, overrides = {}) {
  return {
    id: 'evt-1',
    event,
    creation_date: 1785672000000,
    data: {
      buyer: { email: 'joao@gmail.com', name: 'Joao' },
      purchase: {
        transaction: 'HP123',
        date_next_charge: 1785672000000,
        price: { value: 39, currency_value: 'USD' },
      },
      subscription: { status: 'ACTIVE', subscriber: { code: 'SUB123' } },
      ...overrides,
    },
  };
}

test('refund revokes access even when the payload still says ACTIVE', () => {
  // Hotmart keeps sending subscription.status ACTIVE on a refund - the
  // subscription object describes the plan, not the purchase.
  const parsed = parseWebhookEvent(payload('PURCHASE_REFUNDED'));
  assert.equal(parsed.status, 'expired');
});

test('chargeback revokes access even when the payload still says ACTIVE', () => {
  assert.equal(parseWebhookEvent(payload('PURCHASE_CHARGEBACK')).status, 'expired');
});

test('SUBSCRIPTION_CANCELLATION cancels even when the payload still says ACTIVE', () => {
  // The exact bug: this event also arrives with status ACTIVE, fell through to
  // the ACTIVE branch, and someone who cancelled kept access forever.
  const parsed = parseWebhookEvent(payload('SUBSCRIPTION_CANCELLATION'));
  assert.equal(parsed.status, 'canceled');
});

test('PURCHASE_EXPIRED expires even when the payload still says ACTIVE', () => {
  assert.equal(parseWebhookEvent(payload('PURCHASE_EXPIRED')).status, 'expired');
});

test('a cancelled one-off charge does NOT end a running subscription', () => {
  // PURCHASE_CANCELED must keep yielding to the subscription status: voiding
  // one charge is not the same as ending the subscription.
  assert.equal(parseWebhookEvent(payload('PURCHASE_CANCELED')).status, 'active');
});

test('approved purchase grants access', () => {
  const parsed = parseWebhookEvent(payload('PURCHASE_APPROVED'));
  assert.equal(parsed.status, 'active');
  assert.equal(parsed.buyerEmail, 'joao@gmail.com');
  assert.equal(parsed.providerSubscriptionId, 'SUB123');
  assert.equal(parsed.transactionId, 'HP123');
});

test('overdue maps to past_due, not to no-access', () => {
  const p = parseWebhookEvent(payload('PURCHASE_DELAYED', { subscription: { status: 'OVERDUE' } }));
  assert.equal(p.status, 'past_due');
});

test('date_next_charge is read from purchase, in epoch MILLISECONDS', () => {
  // Reading it from subscription.* returned undefined on 100% of real events,
  // so current_period_end was never filled in.
  const parsed = parseWebhookEvent(payload('PURCHASE_APPROVED'));
  assert.equal(parsed.currentPeriodEnd, new Date(1785672000000).toISOString());
});

test('trial price of zero does not masquerade as the plan price', () => {
  const p = parseWebhookEvent(
    payload('PURCHASE_APPROVED', {
      purchase: {
        transaction: 'HP1',
        price: { value: 0, currency_value: 'USD' },
        full_price: { value: 39, currency_value: 'USD' },
      },
    })
  );
  // pickPrice prefers the first non-zero, so the real plan price wins.
  assert.equal(p.amountCents, 3900);
});

test('the subscription id never falls back to the transaction id', () => {
  // Events arriving BEFORE payment (boleto printed, abandoned cart) carry no
  // subscriber code. Stamping the row with a transaction id there would make
  // the real PURCHASE_APPROVED unable to find it later.
  const p = parseWebhookEvent(
    payload('PURCHASE_BILLET_PRINTED', { subscription: {}, purchase: { transaction: 'HP999' } })
  );
  assert.equal(p.providerSubscriptionId, null);
  assert.equal(p.transactionId, 'HP999');
});

test('cancellation payload uses data.subscriber instead of data.buyer', () => {
  const p = parseWebhookEvent({
    id: 'evt-2',
    event: 'SUBSCRIPTION_CANCELLATION',
    data: { subscriber: { code: 'SUB9', email: 'ana@x.com' }, subscription: { status: 'ACTIVE' } },
  });
  assert.equal(p.buyerEmail, 'ana@x.com');
  assert.equal(p.providerSubscriptionId, 'SUB9');
  assert.equal(p.status, 'canceled');
});

test('normalizeEmail rejects anything unusable as an identity', () => {
  assert.equal(normalizeEmail('  Joao@Gmail.COM '), 'joao@gmail.com');
  assert.equal(normalizeEmail(''), null);
  assert.equal(normalizeEmail('   '), null);
  assert.equal(normalizeEmail('semarroba'), null);
  assert.equal(normalizeEmail('a@semponto'), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(123), null);
});

test('timingSafeEqual compares correctly and never throws on mismatched length', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcdef'), false);
  assert.equal(timingSafeEqual('', ''), true);
  assert.equal(timingSafeEqual(null, 'abc'), false);
});

// --- the wildcard bug, asserted at the source ---
test('no email lookup uses ilike (LIKE wildcards would match another customer)', () => {
  const fs = require('node:fs');
  const files = [
    'api/hotmart-webhook.js',
    'api/auth.js',
  ];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(
      !/\.ilike\(\s*'email'/.test(src),
      `${f}: .ilike('email') treats _ and % as wildcards - ana_costa@x.com would match ana.costa@x.com`
    );
  }
});

// --- the silent-write bug, asserted at the source ---
test('every subscription write checks the error supabase-js returns instead of throwing', () => {
  const fs = require('node:fs');
  const checks = [
    ['api/hotmart-webhook.js', /const \{ error/],
    ['api/auth.js', /const \{ error: linkError \}/],
  ];
  for (const [f, pattern] of checks) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(pattern.test(src), `${f}: write result is not being checked for error`);
  }

  // And the webhook must be able to answer non-200 so Hotmart retries.
  const webhook = fs.readFileSync('api/hotmart-webhook.js', 'utf8');
  assert.ok(
    /res\.status\(500\)/.test(webhook),
    'hotmart-webhook must return 500 on a failed write, or a lost purchase is never retried'
  );
});

test('the product id is extracted so cross-product purchases can be filtered', () => {
  // One Hotmart account can sell several products. A webhook configured at
  // account level delivers all of them to the same URL - without the product
  // id there is no way to tell a NatureLens sale from a sale of something else
  // by the same seller, and the other product's buyer would be granted access.
  const withProduct = parseWebhookEvent({
    id: 'evt-3',
    event: 'PURCHASE_APPROVED',
    data: {
      product: { id: 5555555, ucode: 'abc-def' },
      buyer: { email: 'joao@gmail.com' },
      purchase: { transaction: 'HP1' },
      subscription: { status: 'ACTIVE', subscriber: { code: 'S1' } },
    },
  });
  assert.equal(withProduct.productId, '5555555');

  // Absent product must be null, never undefined-as-a-string, so the guard in
  // the webhook can distinguish "unknown" from "different".
  assert.equal(parseWebhookEvent(payload('PURCHASE_APPROVED')).productId, null);
});

test('free-use counting is atomic, not read-then-write', () => {
  // Two scans from the same device arriving together both read used_count 0 and
  // both wrote 1, so the person got two free identifications instead of one.
  // Not exotic: it is what a double tap, or an app retry on a flaky connection,
  // produces. increment_category_usage does insert-or-increment in a single
  // statement, which Postgres serialises on the row lock. Verified live: 6
  // concurrent calls returned 1..6 and the stored counter was exactly 6.
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, 'api/_lib/entitlement.js'), 'utf8');
  assert.match(
    src,
    /admin\.rpc\('increment_category_usage'/,
    'recordUsage must call the atomic function, not SELECT-then-upsert'
  );
  // The function has to exist in the migration, or the call 404s on every scan.
  const sql = fs.readFileSync(path.join(__dirname, 'supabase-migration-hotmart.sql'), 'utf8');
  assert.match(sql, /create or replace function public\.increment_category_usage/);
  assert.match(sql, /on conflict \(device_id, category\)/);
});

test('a failed usage write is logged, never swallowed', () => {
  // supabase-js resolves with {data:null,error} instead of throwing, so an
  // unchecked write is silent. That is precisely how fish, bird and sound stayed
  // free and unlimited for days while every request returned 200.
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, 'api/_lib/entitlement.js'), 'utf8');
  assert.match(src, /console\.error\('recordUsage: increment failed'/);
});

test('native screens expose restore access but no external-purchase CTA', () => {
  const fs = require('node:fs');
  const read = (file) => fs.readFileSync(file, 'utf8');

  const herb = read('screens/HerbDetailScreen.js');
  assert.match(
    herb,
    /Platform\.OS === 'web'\s*&&\s*!!details\s*&&\s*!subLoading\s*&&\s*subStatus !== 'active'/,
    'the medicinal-herb Subscribe card must not render in a Play build'
  );

  const subscription = read('screens/SubscriptionScreen.js');
  assert.match(
    subscription,
    /Platform\.OS === 'web'\s*&&\s*!isActive\s*&&\s*!isUnknown/,
    'native must not render the plans/purchase-steering section'
  );
  assert.match(
    subscription,
    /isActive \|\| isUnknown \|\| Platform\.OS === 'web'/,
    'the free-plan Subscribe copy must also stay out of native status'
  );
  assert.match(subscription, /navigation\.navigate\('RestoreAccess'\)/, 'existing subscribers must still sign in');

  const profile = read('screens/ProfileScreen.js');
  assert.match(profile, /navigation\.navigate\('RestoreAccess'\)/, 'Profile must keep account restoration');
  assert.match(profile, /subStatus === null\s*&&\s*Platform\.OS === 'web'/, 'Profile purchase CTA must stay web-only');
});

test('native paywall and legal surfaces contain no purchase steering link', () => {
  const fs = require('node:fs');
  const paywall = fs.readFileSync('components/PaywallModal.js', 'utf8');
  const nativeStart = paywall.indexOf("if (Platform.OS !== 'web')");
  const nativeEnd = paywall.indexOf('\n  }\n\n  return (', nativeStart);
  const nativeBranch = paywall.slice(nativeStart, nativeEnd);
  assert.doesNotMatch(nativeBranch, /\{title|\{body\}|webOnlyBody|PLAN_PRICES|onSubscribe|paywall\.subscribe/);
  assert.match(nativeBranch, /paywall\.title/);
  assert.match(nativeBranch, /common\.close/);

  const terms = fs.readFileSync('screens/TermsScreen.js', 'utf8');
  assert.match(
    terms,
    /Platform\.OS === 'web'\s*&&[\s\S]{0,300}Linking\.openURL\(FULL_DOC_URL\)/,
    'the website terms link can indirectly reach checkout and must be web-only'
  );

  const subscription = fs.readFileSync('components/subscription.js', 'utf8');
  assert.match(
    subscription,
    /function getCheckoutLink\(plan\) \{\s*if \(Platform\.OS !== 'web'\) return '';/,
    'native code must not expose a usable external checkout URL'
  );
});
