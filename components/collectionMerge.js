function entryTimestamp(entry) {
  const value = entry?.updatedAt || entry?.savedAt;
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

function fieldTimestamp(entry, field) {
  const value = entry?.[field];
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

function timestampAfter(...entries) {
  let time = Date.now();
  for (const entry of entries) {
    time = Math.max(
      time,
      entryTimestamp(entry) + 1,
      fieldTimestamp(entry, 'specimenNoteUpdatedAt') + 1
    );
  }
  return new Date(time).toISOString();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const next = {};
    for (const key of Object.keys(value).sort()) next[key] = stableValue(value[key]);
    return next;
  }
  return value;
}

function generalTieKey(entry) {
  const clean = {};
  for (const key of Object.keys(entry || {}).sort()) {
    if (key === 'photoUri' || key === 'specimenNote' || key === 'specimenNoteUpdatedAt') continue;
    if (entry[key] !== undefined) clean[key] = stableValue(entry[key]);
  }
  return JSON.stringify(clean);
}

function mergeCollectionEntries(local, remote) {
  const localGeneralTime = entryTimestamp(local);
  const remoteGeneralTime = entryTimestamp(remote);
  const remoteGeneralWins = remoteGeneralTime > localGeneralTime || (
    remoteGeneralTime === localGeneralTime && generalTieKey(remote) > generalTieKey(local)
  );
  const next = remoteGeneralWins ? { ...local, ...remote } : { ...local };
  let remoteApplied = remoteGeneralWins;

  const localNoteTime = fieldTimestamp(local, 'specimenNoteUpdatedAt');
  const remoteNoteTime = fieldTimestamp(remote, 'specimenNoteUpdatedAt');
  const localHasNote = Object.prototype.hasOwnProperty.call(local || {}, 'specimenNote');
  const remoteHasNote = Object.prototype.hasOwnProperty.call(remote || {}, 'specimenNote');

  if (remoteNoteTime > localNoteTime && remoteHasNote) {
    next.specimenNote = remote.specimenNote;
    next.specimenNoteUpdatedAt = remote.specimenNoteUpdatedAt;
    remoteApplied = true;
    if (!remoteGeneralWins) next.updatedAt = timestampAfter(local, remote);
  } else if (localNoteTime > remoteNoteTime && localHasNote) {
    next.specimenNote = local.specimenNote;
    next.specimenNoteUpdatedAt = local.specimenNoteUpdatedAt;
    if (remoteGeneralWins) next.updatedAt = timestampAfter(local, remote);
  } else if (
    localNoteTime > 0
    && localHasNote
    && remoteHasNote
    && String(local.specimenNote) !== String(remote.specimenNote)
  ) {
    // Dois aparelhos podem gravar no mesmo milissegundo. O maior texto e um
    // desempate arbitrario, mas estavel: ambos chegam ao mesmo vencedor.
    const remoteNoteWinsTie = String(remote.specimenNote) > String(local.specimenNote);
    const winner = remoteNoteWinsTie ? remote : local;
    next.specimenNote = winner.specimenNote;
    next.specimenNoteUpdatedAt = winner.specimenNoteUpdatedAt;
    remoteApplied = remoteApplied || remoteNoteWinsTie;
    if (remoteNoteWinsTie !== remoteGeneralWins) next.updatedAt = timestampAfter(local, remote);
  }

  // O servidor nunca recebe photoUri. A foto local nao pode desaparecer quando
  // qualquer relogio remoto vence, inclusive o relogio independente da nota.
  if (Object.prototype.hasOwnProperty.call(local || {}, 'photoUri')) next.photoUri = local.photoUri;
  return { entry: next, remoteApplied };
}

function mergeCollections(localEntries, remoteEntries, remoteDeleted) {
  const local = Array.isArray(localEntries) ? localEntries : [];
  const remote = Array.isArray(remoteEntries) ? remoteEntries : [];
  const deleted = remoteDeleted instanceof Set ? remoteDeleted : new Set(remoteDeleted || []);
  const bySavedId = new Map();
  let removed = 0;

  for (const entry of local) {
    if (!entry?.savedId) continue;
    if (deleted.has(entry.savedId)) {
      removed += 1;
      continue;
    }
    bySavedId.set(entry.savedId, entry);
  }

  let added = 0;
  let updated = 0;
  for (const entry of remote) {
    if (!entry?.savedId || deleted.has(entry.savedId)) continue;
    const current = bySavedId.get(entry.savedId);
    if (!current) {
      bySavedId.set(entry.savedId, entry);
      added += 1;
      continue;
    }

    const merged = mergeCollectionEntries(current, entry);
    if (merged.remoteApplied) {
      bySavedId.set(entry.savedId, merged.entry);
      updated += 1;
    }
  }

  const entries = Array.from(bySavedId.values()).sort((a, b) =>
    String(b.savedAt || '').localeCompare(String(a.savedAt || ''))
  );
  return {
    entries,
    added,
    updated,
    removed,
    changed: added > 0 || updated > 0 || removed > 0,
  };
}

module.exports = { entryTimestamp, mergeCollectionEntries, mergeCollections };
