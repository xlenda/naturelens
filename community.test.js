const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('./site-climate.test');
require('./tropical-care.test');

const api = fs.readFileSync('api/community.js', 'utf8');
const migration = fs.readFileSync('supabase-migration-community.sql', 'utf8');
const client = fs.readFileSync('components/community.js', 'utf8');

test('community score is server-derived and cannot be submitted by the client', () => {
  assert.match(migration, /community_leaderboard/);
  assert.match(migration, /helpful_received/);
  assert.doesNotMatch(client, /score\s*:/);
  assert.doesNotMatch(api, /req\.body\?\.score/);
});

test('community has reports, blocks, deletion and automatic review', () => {
  assert.match(migration, /community_reports/);
  assert.match(migration, /community_blocks/);
  assert.match(api, /action === 'report'/);
  assert.match(api, /action === 'block'/);
  assert.match(api, /action === 'delete'/);
  assert.match(api, /from\(table\)\.delete\(\)/);
  assert.match(api, /count < 3/);
  assert.match(api, /moderation_state: 'review'/);
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
