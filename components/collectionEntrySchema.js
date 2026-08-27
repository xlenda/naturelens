const COLLECTION_CATEGORIES = new Set([
  'plant', 'tree', 'crop', 'mushroom', 'insect', 'fish', 'bird', 'sound',
]);

const TEXT_FIELDS = new Set([
  'savedId', 'category', 'id', 'name', 'scientific', 'displayName', 'nickname',
  'overview', 'overviewOriginal', 'specimenNote', 'room', 'photoUri',
  'referencePhoto', 'savedAt', 'updatedAt', 'lastWateredAt',
  'specimenNoteUpdatedAt', 'healthCheckedAt', 'sourceProvider',
  'resultLanguage', 'family', 'ord', 'group', 'url', 'origin', 'taxonClass',
  'taxonPhylum',
]);

const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 200;
const MAX_OBJECT_KEYS = 120;
const MAX_TEXT_CHARS = 12000;
const MAX_PHOTO_URI_CHARS = 8 * 1024 * 1024;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitiseValue(value, depth = 0, field = '') {
  if (value === null) return { ok: true, value: null };
  if (typeof value === 'string') {
    const limit = field === 'photoUri' ? MAX_PHOTO_URI_CHARS : MAX_TEXT_CHARS;
    if (value.length > limit) return { ok: false };
    return { ok: true, value };
  }
  if (typeof value === 'number') return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  if (typeof value === 'boolean') return { ok: true, value };
  if (depth >= MAX_DEPTH) return { ok: false };
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) return { ok: false };
    const next = [];
    for (const item of value) {
      const clean = sanitiseValue(item, depth + 1);
      if (!clean.ok) return { ok: false };
      next.push(clean.value);
    }
    return { ok: true, value: next };
  }
  if (!isPlainObject(value)) return { ok: false };
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) return { ok: false };
  const next = {};
  for (const [key, item] of entries) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key.length > 64) {
      return { ok: false };
    }
    const clean = sanitiseValue(item, depth + 1, key);
    if (!clean.ok) return { ok: false };
    next[key] = clean.value;
  }
  return { ok: true, value: next };
}

function normaliseCollectionEntry(value, { strict = false } = {}) {
  if (!isPlainObject(value)) return null;
  const savedId = typeof value.savedId === 'string' ? value.savedId.trim() : '';
  const category = typeof value.category === 'string' ? value.category.trim() : '';
  if (strict && (!savedId || !COLLECTION_CATEGORIES.has(category))) return null;
  if (savedId.length > 128 || category.length > 32) return null;

  const source = { ...value };
  if (savedId) source.savedId = savedId;
  if (category) source.category = category;

  for (const field of TEXT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field) || source[field] === null) continue;
    if (typeof source[field] !== 'string') {
      if (strict) return null;
      delete source[field];
      continue;
    }
    const limit = field === 'photoUri' ? MAX_PHOTO_URI_CHARS : MAX_TEXT_CHARS;
    if (source[field].length > limit) return null;
  }

  const clean = sanitiseValue(source);
  return clean.ok ? clean.value : null;
}

module.exports = {
  COLLECTION_CATEGORIES,
  MAX_PHOTO_URI_CHARS,
  normaliseCollectionEntry,
};
