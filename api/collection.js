const { getSupabaseAdmin, requireDeviceId } = require('./_lib/supabaseAdmin');
const { checkRateLimit } = require('./_lib/rateLimit');
const { entryTimestamp, mergeCollectionEntries } = require('../components/collectionMerge');
const { sanitiseIdentityV1 } = require('../components/taxonIdentity');

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
const MAX_PAYLOAD_CHARS = 12000;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 30;
const MAX_NESTING = 4;
const READ_PAGE_SIZE = 500;
const ID_QUERY_SIZE = 100;
const WRITE_CONCURRENCY = 12;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

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
  'overviewOriginal',
  'overviewIsProse',
  'overviewCitation',
  'overviewLicense',
  'overviewLicenseUrl',
  'sourceProvider',
  'resultLanguage',
  'identityV1',
  'subjectProbability',
  'gbifId',
  'displayName',
  'origin',
  'taxonClass',
  'taxonPhylum',
  'family',
  'ord',
  'group',
  'url',
  'commonNames',
  'synonyms',
  'water',
  'waterLabel',
  'edibleParts',
  'toxicity',
  'bestWatering',
  'bestLightCondition',
  'bestSoilType',
  'commonUses',
  'culturalSignificance',
  'propagationMethods',
  // Seguranca de fungos e insetos: o valor cru escolhe a cor e o Label e o
  // texto traduzido. Os dois precisam atravessar o sync juntos.
  'edibility',
  'edibilityLabel',
  'psychoactive',
  'lookAlike',
  'lookAlikeDetails',
  'danger',
  'dangerLabel',
  'dangerDescription',
  'role',
  'redList',
  // Laudo de lavoura e metadados de peixe sao conteudo pequeno, nao foto do
  // usuario. Sem eles, reabrir a mesma descoberta em outro aparelho mudava o
  // resultado e podia apagar o tratamento ou a decisao de traducao.
  'healthAssessed',
  'healthScientific',
  'healthCheckedAt',
  'healthSourceProvider',
  'healthResultLanguage',
  'disease',
  'referencePhoto',
  'detectionScore',
  'alternatives',
  'similarImages',
  'savedAt',
  'room',
  'lastWateredAt',
  'updatedAt',
  'specimenNote',
  'specimenNoteUpdatedAt',
  // The user's own pet name for the find ("the balcony fern"). Affective
  // metadata, tiny, and the whole point of cloud sync is that a rebuilt
  // device gets the collection back AS THE USER KNOWS IT - losing every
  // nickname on restore would make the recovered collection feel like
  // someone else's.
  'nickname',
];

// Nesses campos null e uma exclusao deliberada, nao ausencia de dado. Sem o
// valor explicito, limpar comodo/apelido ou substituir um laudo por "saudavel"
// faria a versao antiga reaparecer no aparelho seguinte.
const NULLABLE_FIELDS = new Set(['room', 'nickname', 'disease']);

function sanitiseValue(value, depth = 0) {
  if (typeof value === 'string') return value.slice(0, 2000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (depth >= MAX_NESTING) return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitiseValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const clean = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const next = sanitiseValue(item, depth + 1);
      if (next !== undefined) clean[key.slice(0, 64)] = next;
    }
    return clean;
  }
  return undefined;
}

function sanitiseTimestamp(value) {
  if (typeof value !== 'string' || value.length > 40 || !ISO_TIMESTAMP.test(value)) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  // Relogio adiantado nao pode congelar o LWW nem adiar cuidado por anos. O
  // servidor e a referencia comum entre aparelhos, entao futuro vira agora.
  return new Date(Math.min(parsed, Date.now())).toISOString();
}

function sanitiseEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const savedId = typeof entry.savedId === 'string' ? entry.savedId.slice(0, 64) : null;
  const category = typeof entry.category === 'string' ? entry.category.slice(0, 32) : null;
  if (!savedId || !category) return null;

  const payload = {};
  for (const field of SYNCED_FIELDS) {
    const value = entry[field];
    if (field === 'identityV1') {
      const clean = sanitiseIdentityV1(value);
      if (clean) payload[field] = clean;
      continue;
    }
    if (field === 'specimenNote') {
      if (value === undefined) continue;
      // String vazia e a lapide da nota: null de um cliente antigo tambem vira
      // vazio para apagar no outro aparelho, em vez de sumir no sanitizador.
      payload[field] = (typeof value === 'string' ? value : '').slice(0, 500);
      continue;
    }
    if (value === null && NULLABLE_FIELDS.has(field)) {
      payload[field] = null;
      continue;
    }
    if (field === 'specimenNoteUpdatedAt') {
      const clean = sanitiseTimestamp(value);
      if (clean !== undefined) payload[field] = clean;
      continue;
    }
    if (
      field === 'savedAt' ||
      field === 'updatedAt' ||
      field === 'lastWateredAt' ||
      field === 'healthCheckedAt'
    ) {
      const clean = sanitiseTimestamp(value);
      if (clean !== undefined) payload[field] = clean;
      continue;
    }
    if (value === undefined || value === null) continue;
    const clean = sanitiseValue(value);
    if (clean !== undefined) payload[field] = clean;
  }

  if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) return null;

  return {
    saved_id: savedId,
    category,
    payload,
    saved_at: payload.savedAt || null,
  };
}

function cleanSavedIds(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .filter((value) => typeof value === 'string')
        .map((value) => value.slice(0, 64))
        .filter(Boolean)
    )
  );
}

// O preflight precisa ler exatamente os IDs que podem ser gravados. Um limit
// global deixava a versao atual fora da consulta quando a conta acumulava 500
// lapides, e a copia velha parecia uma insercao nova.
async function readRowsBySavedIds(admin, email, savedIds) {
  const ids = cleanSavedIds(savedIds);
  const data = [];
  for (let start = 0; start < ids.length; start += ID_QUERY_SIZE) {
    const { data: page, error } = await admin
      .from('collection_entries')
      .select('saved_id, category, payload, saved_at, updated_at, deleted')
      .eq('email', email)
      .in('saved_id', ids.slice(start, start + ID_QUERY_SIZE));
    if (error) return { data: null, error };
    data.push(...(page || []));
  }
  return { data, error: null };
}

// Ativos e lapides nao disputam a mesma janela. A paginacao usa a chave
// imutavel, nao offset: atualizar uma linha durante a leitura nao desloca as
// paginas e nao faz outra linha desaparecer.
async function readActiveRows(admin, email) {
  const data = [];
  let afterSavedId = null;
  while (true) {
    let query = admin
      .from('collection_entries')
      .select('saved_id, category, payload, saved_at, updated_at, deleted')
      .eq('email', email)
      .eq('deleted', false)
      .order('saved_id', { ascending: true })
      .limit(READ_PAGE_SIZE);
    if (afterSavedId !== null) query = query.gt('saved_id', afterSavedId);
    const { data: page, error } = await query;
    if (error) return { data: null, error };
    const rows = page || [];
    data.push(...rows);
    if (rows.length < READ_PAGE_SIZE) return { data, error: null };
    afterSavedId = rows[rows.length - 1].saved_id;
  }
}

function nextServerTimestamp(previous) {
  const previousTime = typeof previous === 'string' ? Date.parse(previous) : NaN;
  return new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
}

function databaseRow(email, row, previous) {
  return {
    email,
    saved_id: row.saved_id,
    category: row.category,
    payload: row.payload,
    saved_at: row.saved_at,
    deleted: false,
    updated_at: nextServerTimestamp(previous?.updated_at),
  };
}

async function runWithConcurrency(items, worker) {
  let cursor = 0;
  let firstError = null;
  const run = async () => {
    while (!firstError && cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      const result = await worker(item);
      if (result?.error) firstError = result.error;
    }
  };
  const workers = Array.from(
    { length: Math.min(WRITE_CONCURRENCY, items.length) },
    () => run()
  );
  await Promise.all(workers);
  return firstError;
}

async function writeActiveRows(admin, email, rows, existingBySavedId) {
  const inserts = [];
  const updates = [];
  for (const row of rows) {
    const current = existingBySavedId.get(row.saved_id);
    if (!current) {
      inserts.push(databaseRow(email, row, null));
      continue;
    }
    if (current.deleted) continue;
    const currentEntry = {
      ...(current.payload || {}),
      savedAt: current.payload?.savedAt || current.saved_at,
      updatedAt: current.payload?.updatedAt || current.updated_at,
    };
    const merged = mergeCollectionEntries(currentEntry, row.payload);
    if (entryTimestamp(merged.entry) > entryTimestamp(currentEntry)) {
      // Nota e rega tem relogios independentes. Gravar a combinacao evita que
      // um push mais novo de rega apague uma nota remota que tambem era nova.
      updates.push({ row: { ...row, payload: merged.entry }, current });
    }
  }

  if (inserts.length) {
    // Uma insercao concorrente vence a chave e fica para o pull decidir. O
    // ignore evita que um conflito aborte tambem os outros achados do lote.
    const { error } = await admin.from('collection_entries').upsert(inserts, {
      onConflict: 'email,saved_id',
      ignoreDuplicates: true,
    });
    if (error) return error;
  }

  // Este PATCH e o CAS do schema atual: updated_at precisa continuar igual ao
  // valor lido no preflight. Se outra requisicao gravou primeiro, zero linhas
  // mudam e o pull devolve a vencedora; nunca fazemos um upsert cego por cima.
  return runWithConcurrency(updates, async ({ row, current }) => {
    const next = databaseRow(email, row, current);
    const { data, error } = await admin
      .from('collection_entries')
      .update({
        category: next.category,
        payload: next.payload,
        saved_at: next.saved_at,
        deleted: false,
        updated_at: next.updated_at,
      })
      .eq('email', email)
      .eq('saved_id', row.saved_id)
      .eq('updated_at', current.updated_at)
      .eq('deleted', false)
      .select('saved_id');
    // data vazio e conflito, nao falha: alguem alterou a linha entre leitura e
    // escrita. O estado final vem da consulta posterior.
    return { data, error };
  });
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

  const submittedEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  // Nunca descarte um exemplar enviado em silencio. Se a ficha ainda exceder o
  // limite depois da limpeza, o lote inteiro para antes de tocar no banco; caso
  // contrario o cliente receberia synced:true enquanto perdia uma descoberta.
  if (submittedEntries.length > MAX_ENTRIES) {
    res.status(400).json({ error: 'Invalid collection payload.', reason: 'invalidEntry' });
    return;
  }
  const invalidEntry = submittedEntries.find((entry) => sanitiseEntry(entry) === null);
  if (invalidEntry !== undefined) {
    res.status(400).json({ error: 'Invalid collection entry.', reason: 'invalidEntry' });
    return;
  }
  const incoming = submittedEntries;
  const deletedIds = cleanSavedIds(
    Array.isArray(req.body?.deletedIds) ? req.body.deletedIds.slice(0, MAX_ENTRIES) : []
  );
  const deletedSet = new Set(deletedIds);

  // Um cliente modificado pode repetir savedId no mesmo lote. Guardar so a
  // versao mais nova torna a escolha deterministica antes de tocar no banco.
  const rowBySavedId = new Map();
  for (const row of incoming.map(sanitiseEntry)) {
    if (deletedSet.has(row.saved_id)) continue;
    const current = rowBySavedId.get(row.saved_id);
    if (!current) {
      rowBySavedId.set(row.saved_id, row);
      continue;
    }
    const incomingGeneralWins = entryTimestamp(row.payload) > entryTimestamp(current.payload);
    const merged = mergeCollectionEntries(current.payload, row.payload);
    rowBySavedId.set(row.saved_id, {
      ...(incomingGeneralWins ? row : current),
      payload: merged.entry,
    });
  }
  const rows = Array.from(rowBySavedId.values());
  const relevantIds = [...rows.map((row) => row.saved_id), ...deletedIds];

  // Ler antes de gravar e obrigatorio: se o aparelho A ficou offline, o B
  // editou um apelido e depois A sincronizou, o upsert cego de A apagava B antes
  // que a resposta pudesse devolver a versao nova. Tombstone remoto tambem nao
  // pode ser ressuscitado por uma copia antiga que ainda o carrega.
  const { data: existing, error: existingError } = await readRowsBySavedIds(
    admin,
    email,
    relevantIds
  );

  if (existingError) {
    console.error('collection: preflight read failed', email, existingError.message);
    res.status(503).json({ error: 'Could not read your collection.', reason: 'syncFailed' });
    return;
  }

  const existingBySavedId = new Map((existing || []).map((row) => [row.saved_id, row]));
  const writeError = await writeActiveRows(admin, email, rows, existingBySavedId);
  if (writeError) {
    // supabase-js reports failure through `error`, not by throwing. Reporting
    // success here would tell someone their collection was backed up when it
    // was not - the worst possible lie for a feature whose whole purpose is
    // not losing things.
    console.error('collection: upsert failed', email, writeError.message);
    res.status(503).json({ error: 'Could not save your collection.', reason: 'syncFailed' });
    return;
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
        updated_at: nextServerTimestamp(existingBySavedId.get(savedId)?.updated_at),
      })),
      { onConflict: 'email,saved_id' }
    );
    if (error) {
      console.error('collection: tombstone upsert failed', email, error.message);
      res.status(503).json({ error: 'Could not save collection deletions.', reason: 'syncFailed' });
      return;
    }
  }

  // Rele os IDs deste aparelho depois das escritas. Assim uma lapide criada
  // durante o CAS tambem volta na mesma resposta e so exclusao realmente
  // visivel no banco e confirmada pelo cliente.
  const { data: finalRelevant, error: relevantError } = await readRowsBySavedIds(
    admin,
    email,
    relevantIds
  );
  if (relevantError) {
    console.error('collection: confirmation read failed', email, relevantError.message);
    res.status(503).json({ error: 'Could not confirm collection changes.', reason: 'syncFailed' });
    return;
  }

  // Pull ativo e paginado: lapides nunca consomem as 500 vagas de uma pagina.
  const { data: active, error: readError } = await readActiveRows(admin, email);

  if (readError) {
    console.error('collection: read failed', email, readError.message);
    res.status(503).json({ error: 'Could not read your collection.', reason: 'syncFailed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    synced: true,
    entries: (active || []).map((r) => ({
      savedId: r.saved_id,
      category: r.category,
      savedAt: r.saved_at,
      ...r.payload,
      updatedAt: r.payload?.updatedAt || r.updated_at || r.saved_at,
    })),
    deletedIds: (finalRelevant || []).filter((r) => r.deleted).map((r) => r.saved_id),
  });
};

// Export auxiliar para o teste de contrato; a funcao HTTP continua sendo o
// export principal que a Vercel executa.
module.exports.sanitiseEntry = sanitiseEntry;
