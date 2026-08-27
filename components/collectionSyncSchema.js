// Uma unica allowlist governa cliente e servidor. Se cada lado mantiver sua
// propria lista, um campo privado pode atravessar a rede antes que o servidor o
// descarte, ou um campo legitimo pode desaparecer na restauracao.
const COLLECTION_SYNC_FIELDS = Object.freeze([
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
  'nickname',
  'identityReview',
  'checkIn',
]);

function projectEntryForSync(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const savedId = typeof entry.savedId === 'string' ? entry.savedId : null;
  const category = typeof entry.category === 'string' ? entry.category : null;
  if (!savedId || !category) return null;

  const projected = { savedId, category };
  for (const field of COLLECTION_SYNC_FIELDS) {
    if (field === 'category' || !Object.prototype.hasOwnProperty.call(entry, field)) continue;
    projected[field] = entry[field];
  }
  return projected;
}

function projectCollectionForSync(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(projectEntryForSync).filter(Boolean);
}

module.exports = { COLLECTION_SYNC_FIELDS, projectEntryForSync, projectCollectionForSync };
