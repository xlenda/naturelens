const { getSupabaseAdmin, requireDeviceId } = require('./_lib/supabaseAdmin');
const { checkRateLimit } = require('./_lib/rateLimit');

// Cloud sync of the collection, for signed-in subscribers.
//
// WHY IT EXISTS
// The collection lives in the browser's storage and nowhere else. Manual export
// and import exist, but a lost phone still loses everything - and it is the one
// thing in this app a person cannot get back.
//
// WHAT SYNCS AND WHAT DOES NOT
// Only the FIND: name, species, category, confidence, date, description. The
// user's own photograph is NOT uploaded. Two reasons, and the second decides it:
//   1. each photo is a ~300 KB base64 JPEG, so 100 finds would be 30 MB per
//      account against ~100 KB of metadata;
//   2. the privacy policy states plainly that we do not store photos on any
//      server we control. Uploading them would make that false.
// The species reference photo is re-fetchable from the scientific name, so a
// find still appears with an image on the other device.
//
// MERGE, NEVER REPLACE
// Same rule as the manual backup import. A sync that could empty a collection
// would be a second way to lose it, which is exactly what this feature exists to
// prevent. Deletions travel as tombstones rather than as absence - without that,
// deleting a find on one device and syncing would resurrect it from the other.

// A find is small; a photo is not. This is the guard that keeps the promise
// above true even if a client is ever changed to send more than it should.
const MAX_ENTRIES = 500;
const MAX_PAYLOAD_CHARS = 4000;

// Fields worth carrying across devices. Everything else - photoUri above all -
// is dropped here, on the server, so a buggy or modified client cannot upload
// what the privacy policy says is never uploaded.
const SYNCED_FIELDS = [
  'id',
  'name',
  'scientific',
  'category',
  'confidence',
  'overview',
  'origin',
  'group',
  'url',
  'commonNames',
  'synonyms',
  'water',
  'edibleParts',
  'toxicity',
  'savedAt',
];

function sanitiseEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const savedId = typeof entry.savedId === 'string' ? entry.savedId.slice(0, 64) : null;
  const category = typeof entry.category === 'string' ? entry.category.slice(0, 32) : null;
  if (!savedId || !category) return null;

  const payload = {};
  for (const field of SYNCED_FIELDS) {
    const value = entry[field];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') payload[field] = value.slice(0, 2000);
    else if (typeof value === 'number' || typeof value === 'boolean') payload[field] = value;
  }

  if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) return null;

  return {
    saved_id: savedId,
    category,
    payload,
    saved_at: typeof entry.savedAt === 'string' ? entry.savedAt : null,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!(await checkRateLimit(req, res, { scope: 'collection-sync', limit: 60, windowSeconds: 3600 }))) {
    return;
  }

  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  const admin = getSupabaseAdmin();

  // The account this device belongs to. No account, no sync - and that is not
  // an error, it is simply the free experience: the local collection keeps
  // working exactly as before.
  const { data: sub, error: subError } = await admin
    .from('subscriptions')
    .select('email, status')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (subError) {
    console.error('collection: subscription read failed', deviceId, subError.message);
    res.status(503).json({ error: 'Could not reach the sync service.', reason: 'syncUnavailable' });
    return;
  }

  if (!sub?.email) {
    res.status(200).json({ synced: false, reason: 'notSignedIn' });
    return;
  }

  const email = String(sub.email).toLowerCase();

  const incoming = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, MAX_ENTRIES) : [];
  const deletedIds = Array.isArray(req.body?.deletedIds)
    ? req.body.deletedIds.filter((id) => typeof id === 'string').slice(0, MAX_ENTRIES)
    : [];

  const rows = incoming.map(sanitiseEntry).filter(Boolean);

  // Push. Upsert rather than insert so re-syncing the same find is harmless -
  // this runs on every visit to the Collection screen.
  if (rows.length) {
    const { error } = await admin.from('collection_entries').upsert(
      rows.map((r) => ({ ...r, email, deleted: false, updated_at: new Date().toISOString() })),
      { onConflict: 'email,saved_id' }
    );
    if (error) {
      // supabase-js reports failure through `error`, not by throwing. Reporting
      // success here would tell someone their collection was backed up when it
      // was not - the worst possible lie for a feature whose whole purpose is
      // not losing things.
      console.error('collection: upsert failed', email, error.message);
      res.status(503).json({ error: 'Could not save your collection.', reason: 'syncFailed' });
      return;
    }
  }

  // Tombstones. The row stays, marked deleted, so every other device learns the
  // find is gone instead of pushing it back.
  if (deletedIds.length) {
    const { error } = await admin.from('collection_entries').upsert(
      deletedIds.map((savedId) => ({
        email,
        saved_id: savedId,
        // category and payload are NOT NULL, so a tombstone still needs shape.
        category: 'deleted',
        payload: {},
        deleted: true,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'email,saved_id' }
    );
    if (error) {
      console.error('collection: tombstone upsert failed', email, error.message);
    }
  }

  // Pull everything back, including tombstones, so the client can apply the
  // deletions it did not make itself.
  const { data: all, error: readError } = await admin
    .from('collection_entries')
    .select('saved_id, category, payload, saved_at, deleted')
    .eq('email', email)
    .order('updated_at', { ascending: false })
    .limit(MAX_ENTRIES);

  if (readError) {
    console.error('collection: read failed', email, readError.message);
    res.status(503).json({ error: 'Could not read your collection.', reason: 'syncFailed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    synced: true,
    entries: (all || [])
      .filter((r) => !r.deleted)
      .map((r) => ({
        savedId: r.saved_id,
        category: r.category,
        savedAt: r.saved_at,
        ...r.payload,
      })),
    deletedIds: (all || []).filter((r) => r.deleted).map((r) => r.saved_id),
  });
};
