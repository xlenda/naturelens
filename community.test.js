const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('./site-climate.test');
require('./tropical-care.test');

const api = fs.readFileSync('api/community.js', 'utf8');
const migration = fs.readFileSync('supabase-migration-community.sql', 'utf8');
const client = fs.readFileSync('components/community.js', 'utf8');
const screen = fs.readFileSync('screens/CommunityScreen.js', 'utf8');
const moderation = fs.readFileSync('scripts/community-moderation.js', 'utf8');

test('community score is server-derived and cannot be submitted by the client', () => {
  assert.match(migration, /community_leaderboard/);
  assert.match(migration, /helpful_received/);
  assert.doesNotMatch(client, /score\s*:/);
  assert.doesNotMatch(api, /req\.body\?\.score/);
});

test('community has reports, blocks and deletion without Sybil auto-moderation', () => {
  assert.match(migration, /community_reports/);
  assert.match(migration, /community_blocks/);
  assert.match(api, /action === 'report'/);
  assert.match(api, /action === 'block'/);
  assert.match(api, /action === 'delete'/);
  assert.match(api, /from\(table\)\.delete\(\)/);
  assert.doesNotMatch(api, /async function quarantine/);
  assert.doesNotMatch(api, /count < 3/);
  assert.doesNotMatch(api, /await quarantine/);
});

test('community requires server-side terms and supports moderation of comments', () => {
  assert.match(migration, /terms_accepted_at/);
  assert.match(api, /action === 'accept_terms'/);
  assert.match(api, /Community terms must be accepted/);
  assert.match(screen, /reportCommunityTarget\('comment'/);
  assert.match(screen, /deleteCommunityTarget\('comment'/);
  assert.match(screen, /accessibilityRole="checkbox"/);
});

test('community has independent network and device rate limits', () => {
  assert.match(api, /scope: `community-\$\{rateKind\}`/);
  assert.match(api, /scope: `community-\$\{rateKind\}-device:\$\{deviceId\}`/);
  assert.match(api, /ignoreIp: true/);
});

test('reported content has a human moderation queue and auditable resolution', () => {
  assert.match(migration, /status text not null default 'pending'/);
  assert.match(migration, /reviewed_at/);
  assert.match(moderation, /eq\('status', 'pending'\)/);
  assert.match(moderation, /moderation_state/);
  assert.match(moderation, /community_profiles/);
  assert.doesNotMatch(moderation, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
});

test('community never uploads user photos or accepts arbitrary links', () => {
  assert.doesNotMatch(migration, /photo_url|image_url|storage_path/);
  assert.match(api, /HAS_URL\.test\(body\)/);
  assert.doesNotMatch(client, /photoUri|base64/);
});

test('public nicknames never reveal a prefix of the private device id', () => {
  assert.match(api, /randomBytes\(3\)/);
  assert.doesNotMatch(api, /deviceId\.replace\([^\n]+slice\(0,\s*5\)/);
});

test('community tables are private behind service role', () => {
  for (const table of ['community_profiles', 'community_posts', 'community_comments', 'community_reactions']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.doesNotMatch(migration, /create policy/i);
});
