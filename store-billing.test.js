const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const legacyProvider = ['hot', 'mart'].join('');
const localeCodes = ['ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pl', 'pt', 'sv', 'tr', 'zh', 'zh-hant'];

test('legacy payment endpoint and parser are removed', () => {
  assert.equal(fs.existsSync(path.join(__dirname, 'api', `${legacyProvider}-webhook.js`)), false);
  assert.equal(fs.existsSync(path.join(__dirname, 'api', '_lib', `${legacyProvider}.js`)), false);
});

test('legacy payment migration and test are removed', () => {
  assert.equal(fs.existsSync(path.join(__dirname, `supabase-migration-${legacyProvider}.sql`)), false);
  assert.equal(fs.existsSync(path.join(__dirname, `${legacyProvider}.test.js`)), false);
});

test('test command no longer loads the legacy suite', () => {
  assert.doesNotMatch(require('./package.json').scripts.test, new RegExp(legacyProvider, 'i'));
});

test('subscription client has no external checkout or hardcoded price', () => {
  const source = read('components/subscription.js');
  assert.doesNotMatch(source, /checkout|PLAN_PRICES|EXPO_PUBLIC_\w+_LINK|currency:\s*'USD'/i);
});

test('subscription management uses only official store HTTPS destinations', () => {
  const source = read('components/subscription.js');
  assert.match(source, /https:\/\/play\.google\.com\/store\/account\/subscriptions/);
  assert.match(source, /https:\/\/apps\.apple\.com\/account\/subscriptions/);
  assert.doesNotMatch(source, /window\.|sessionStorage|location\.href/);
});

test('web cannot open a native subscription management destination', () => {
  const source = read('components/subscription.js');
  assert.match(source, /Platform\.OS === 'android' \|\| Platform\.OS === 'ios'/);
  assert.match(source, /if \(!url\) return false/);
});

test('temporary paywall fails closed without a purchase callback', () => {
  const source = read('components/PaywallModal.js');
  assert.doesNotMatch(source, /onSubscribe|startCheckout|startPurchase/);
  assert.match(source, /paywall\.notAvailableYet/);
});

test('temporary paywall renders no plan or price', () => {
  const source = read('components/PaywallModal.js');
  assert.doesNotMatch(source, /PLAN_|planPrice|saveBadge|\$\{|US\$/);
});

test('application has no browser return-from-checkout flow', () => {
  const source = read('App.js');
  assert.doesNotMatch(source, /checkoutResult|subscription_completed|naturelens_checkout_plan/);
});

test('screens cannot start an external checkout', () => {
  const files = fs.readdirSync(path.join(__dirname, 'screens')).filter((name) => name.endsWith('.js'));
  const source = files.map((name) => read(path.join('screens', name))).join('\n');
  assert.doesNotMatch(source, /startCheckout|onSubscribe=/);
});

test('old floating purchase entry points are gone', () => {
  assert.equal(fs.existsSync(path.join(__dirname, 'components', 'SubscribeFab.js')), false);
  assert.doesNotMatch(read('screens/CollectionScreen.js'), /SubscribeFab/);
  assert.doesNotMatch(read('screens/DiscoverScreen.js'), /SubscribeFab/);
});

test('platform core accepts all eight identification categories', () => {
  const sql = read('supabase-migration-platform-core.sql');
  for (const category of ['plant', 'insect', 'mushroom', 'crop', 'tree', 'fish', 'bird', 'sound']) {
    assert.match(sql, new RegExp(`'${category}'`));
  }
});

test('platform core reserves the free use atomically', () => {
  const sql = read('supabase-migration-platform-core.sql');
  assert.match(sql, /create or replace function public\.reserve_category_usage/);
  assert.match(sql, /on conflict \(device_id, category\)[\s\S]*where public\.category_usage\.used_count < 1/);
});

test('platform core can release a refused identification', () => {
  const sql = read('supabase-migration-platform-core.sql');
  assert.match(sql, /create or replace function public\.release_category_usage/);
  assert.match(sql, /used_count = 1/);
});

test('platform core creates the server rate-limit table', () => {
  const sql = read('supabase-migration-platform-core.sql');
  assert.match(sql, /create table if not exists public\.rate_limits/);
  assert.match(sql, /unique \(bucket_key, window_start\)/);
  assert.match(sql, /create or replace function public\.increment_rate_limit/);
  assert.match(sql, /rate_limits_bucket_key_opaque/);
});

test('platform core creates private push subscription storage', () => {
  const sql = read('supabase-migration-platform-core.sql');
  assert.match(sql, /create table if not exists public\.push_subscriptions/);
  assert.match(sql, /alter table public\.push_subscriptions enable row level security/);
});

test('subscription schema is provider-neutral and carries no legacy default', () => {
  const sql = read('supabase-migration-platform-core.sql');
  assert.match(sql, /add column if not exists provider text/);
  assert.match(sql, /add column if not exists product_id text/);
  assert.doesNotMatch(sql, new RegExp(legacyProvider, 'i'));
});

test('usage RPCs are unavailable to public and client roles', () => {
  const sql = read('supabase-migration-platform-core.sql');
  assert.match(sql, /revoke all on function public\.reserve_category_usage\(text, text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.reserve_category_usage\(text, text\) to service_role/);
  assert.match(sql, /revoke all on function public\.increment_rate_limit\(text, timestamptz\) from public, anon, authenticated/);
});

test('published legal pages describe store-only billing and no web sale', () => {
  const pages = ['public/terms.html', 'public/privacy.html', 'public/account-deletion.html', 'public/premium/index.html']
    .map(read).join('\n');
  assert.match(pages, /Google Play/);
  assert.match(pages, /App Store/);
  assert.match(pages, /site n[aã]o vende assinaturas|website does not sell subscriptions/i);
  assert.doesNotMatch(pages, new RegExp(legacyProvider, 'i'));
});

test('all interface languages expose neutral store management without legacy copy', () => {
  for (const code of localeCodes) {
    const locale = JSON.parse(read(`public/locales/${code}.json`));
    assert.equal(typeof locale.subscription.manageStore, 'string', code);
    assert.ok(locale.subscription.manageStore.length > 3, code);
    const oldKey = `open${legacyProvider[0].toUpperCase()}${legacyProvider.slice(1)}`;
    assert.equal(Object.hasOwn(locale.subscription, oldKey), false, code);
    assert.doesNotMatch(JSON.stringify(locale), new RegExp(legacyProvider, 'i'), code);
  }
});
