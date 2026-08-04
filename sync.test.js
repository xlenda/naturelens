// Guards on cloud sync of the collection.
//
// The collection is the one thing in this app a user cannot get back. Every
// rule below exists so that adding sync cannot become a second way to lose it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

test("the user's own photo is never uploaded", () => {
  // The privacy policy states plainly that we do not store photos on any server
  // we control. It is also 300 KB per find against ~1 KB of metadata. The
  // server, not the client, decides what is kept - so a modified or buggy client
  // cannot upload what the policy says is never uploaded.
  const api = read('api/collection.js');
  const start = api.indexOf('const SYNCED_FIELDS');
  const fields = api.slice(start, api.indexOf('];', start));
  assert.doesNotMatch(fields, /photoUri/, 'photoUri must never be in the synced field list');
  assert.match(api, /function sanitiseEntry/, 'entries must be filtered server-side, not trusted');
});

test('a nickname survives sync', () => {
  // The nickname is the user's own name for a find ("the balcony fern"). If
  // the server filter strips it, a restore on a new device silently returns a
  // collection that no longer feels like theirs - and nothing would error.
  const api = read('api/collection.js');
  const start = api.indexOf('const SYNCED_FIELDS');
  const fields = api.slice(start, api.indexOf('];', start));
  assert.match(fields, /'nickname'/, 'nickname must be in the synced field list');

  // And the collection screen must actually let the user search by it - a
  // nickname that cannot find its own find defeats the point of naming it.
  const screen = read('screens/CollectionScreen.js');
  assert.match(screen, /item\.nickname \|\| ''\)\.toLowerCase\(\)\.includes/, 'search must match nicknames');
});

test('sync merges and never replaces', () => {
  // A sync that could empty a collection would be a second way to lose it.
  const client = read('components/collectionSync.js');
  assert.match(client, /const bySavedId = new Map\(\)/);
  // Local wins on conflict: it is the copy carrying the user's own photograph,
  // which the server never receives.
  assert.match(client, /for \(const entry of local\)[\s\S]{0,200}bySavedId\.set/);
});

test('deletions travel as tombstones', () => {
  // Without them, deleting a find here and syncing pulls it straight back from
  // another device, and the app appears to refuse deletions.
  const api = read('api/collection.js');
  assert.match(api, /deleted: true/);
  assert.match(api, /deletedIds: \(all \|\| \)?\.?/);

  const client = read('components/collectionSync.js');
  assert.match(client, /export async function rememberDeletion/);
  assert.match(client, /remoteDeleted\.has\(entry\.savedId\)/, 'a find deleted elsewhere must not be re-added');

  // And removeFromCollection has to actually record one.
  const storage = read('components/storage.js');
  assert.match(storage, /rememberDeletion\(savedId\)/);
});

test('sync never throws and never blocks the screen', () => {
  const client = read('components/collectionSync.js');
  // One catch-all: the local collection already works, sync is a convenience.
  assert.match(client, /catch \(e\) \{[\s\S]{0,200}return \{ synced: false, added: 0 \}/);

  const screen = read('screens/CollectionScreen.js');
  // The local list must render first, then sync. Awaiting sync before setting
  // state would make an offline user stare at a spinner.
  // Slice from `load` to the NEXT useFocusEffect - the name also appears in the
  // import line at the top, and searching from zero produced a backwards slice.
  const loadStart = screen.indexOf('const load = useCallback');
  const load = screen.slice(loadStart, screen.indexOf('useFocusEffect', loadStart));
  assert.ok(
    load.indexOf('setCollection(list)') < load.indexOf('syncCollection('),
    'the local collection must be on screen before sync runs'
  );
  assert.doesNotMatch(load, /await syncCollection/, 'sync must not be awaited during load');
});

test('a failed write is never reported as a successful backup', () => {
  // supabase-js reports failure through `error`, not by throwing. Telling
  // someone their collection was backed up when it was not is the worst possible
  // lie for a feature whose entire purpose is not losing things.
  const api = read('api/collection.js');
  assert.match(api, /console\.error\('collection: upsert failed'/);
  assert.match(api, /reason: 'syncFailed'/);
});

test('replaceCollection is only reachable from sync', () => {
  // It is the one function that can lose finds. Everything else appends or
  // filters.
  const users = fs
    .readdirSync(path.join(__dirname, 'screens'))
    .filter((f) => f.endsWith('.js'))
    .filter((f) => /replaceCollection/.test(read(path.join('screens', f))));
  assert.deepEqual(users, [], `replaceCollection must not be called from a screen: ${users.join(', ')}`);
});

test('the sync endpoint is rate limited and needs a device', () => {
  const api = read('api/collection.js');
  assert.match(api, /scope: 'collection-sync'/);
  assert.match(api, /requireDeviceId\(req, res\)/);
  assert.match(api, /MAX_ENTRIES = 500/);
});
