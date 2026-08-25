import AsyncStorage from '@react-native-async-storage/async-storage';

export const OBSERVATION_DATA_KEY = '@naturelens_observation_data_v1';

export const OBSERVATION_CATEGORIES = Object.freeze([
  'plant',
  'tree',
  'insect',
  'mushroom',
  'fish',
  'bird',
  'sound',
]);

export const OBSERVATION_EVENT_TYPES_BY_CATEGORY = Object.freeze({
  plant: Object.freeze(['observation', 'growth', 'leafChange', 'flowering', 'fruiting', 'symptom', 'care']),
  tree: Object.freeze(['observation', 'growth', 'leafChange', 'flowering', 'fruiting', 'symptom', 'habitat']),
  insect: Object.freeze(['observation', 'count', 'lifeStage', 'behavior', 'interaction', 'habitat']),
  mushroom: Object.freeze(['observation', 'emergence', 'morphology', 'substrate', 'colorChange', 'sporePrint']),
  fish: Object.freeze(['observation', 'count', 'behavior', 'habitat', 'waterReading', 'feeding']),
  bird: Object.freeze(['observation', 'count', 'behavior', 'vocalization', 'nesting', 'flight']),
  sound: Object.freeze(['observation', 'recording', 'comparison', 'context', 'frequency', 'amplitude']),
});

export const OBSERVATION_UNITS_BY_CATEGORY = Object.freeze({
  plant: Object.freeze(['mm', 'cm', 'm', 'ml', 'l', 'celsius', 'percent']),
  tree: Object.freeze(['mm', 'cm', 'm', 'ml', 'l', 'celsius', 'percent']),
  insect: Object.freeze(['mm', 'cm', 'm', 'celsius', 'percent']),
  mushroom: Object.freeze(['mm', 'cm', 'm', 'celsius', 'percent']),
  fish: Object.freeze(['mm', 'cm', 'm', 'g', 'kg', 'celsius', 'ph', 'ppt', 'ppm', 'mgPerL', 'usPerCm']),
  bird: Object.freeze(['cm', 'm', 'km', 'second', 'minute', 'hour', 'hertz', 'kilohertz', 'decibel']),
  sound: Object.freeze(['second', 'minute', 'hour', 'hertz', 'kilohertz', 'decibel']),
});

const DATA_SCHEMA_VERSION = 1;
const PROFILE_SCHEMA_VERSION = 1;
const MAX_PROFILES = 350;
const MAX_EVENTS = 3500;
const MAX_EVENTS_PER_PROFILE = 350;
const MAX_PROFILE_FIELDS = 12;
const MAX_ENUM_OPTIONS = 40;
const MAX_ENUM_LENGTH = 60;
const MAX_PROFILE_TEXT_LENGTH = 500;
const MAX_EVENT_NOTE_LENGTH = 500;
const MAX_COUNT = 1000000;
const MAX_ABSOLUTE_MEASURE = 1000000000;
const FIELD_KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,31}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_SET = new Set(OBSERVATION_CATEGORIES);

let writeTail = Promise.resolve();
let fallbackSequence = 0;

function queueWrite(work) {
  const pending = writeTail.then(work, work);
  writeTail = pending.then(() => undefined, () => undefined);
  return pending;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanIdentifier(value, maxLength) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const clean = String(value).trim().replace(/\s+/g, ' ');
  return clean && clean.length <= maxLength ? clean : '';
}

function normaliseCategory(value) {
  const category = cleanText(value, 20);
  return CATEGORY_SET.has(category) ? category : '';
}

function encodeKeyPart(value) {
  return encodeURIComponent(value);
}

function categoryFromSubjectKey(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 500) return '';
  const parts = value.split(':');
  if (parts[0] !== 'observation' || !CATEGORY_SET.has(parts[1])) return '';
  if ((parts[2] === 'saved' || parts[2] === 'taxon') && parts.length === 4 && parts[3]) {
    return parts[1];
  }
  if (parts[2] === 'provider' && parts.length === 5 && parts[3] && parts[4]) return parts[1];
  return '';
}

function normaliseSubjectKey(value) {
  return categoryFromSubjectKey(value) ? value : '';
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

function normaliseTimestamp(value) {
  if (!isIsoTimestamp(value)) return '';
  return new Date(value).toISOString();
}

function fallbackUuid() {
  fallbackSequence = (fallbackSequence + 1) >>> 0;
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  let timestamp = Date.now();
  let sequence = fallbackSequence;
  for (let index = 0; index < 6; index += 1) {
    bytes[index] ^= timestamp & 0xff;
    timestamp = Math.floor(timestamp / 256);
  }
  for (let index = 0; index < 4; index += 1) {
    bytes[12 + index] ^= sequence & 0xff;
    sequence >>>= 8;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function randomUuid() {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (UUID_PATTERN.test(uuid)) return uuid;
  } catch (e) {
    /* o contador mantem o fallback unico mesmo sem crypto */
  }
  return fallbackUuid();
}

function uniqueUuid(existing) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomUuid();
    if (!existing.has(candidate)) return candidate;
  }
  let candidate = fallbackUuid();
  while (existing.has(candidate)) candidate = fallbackUuid();
  return candidate;
}

export function observationSubjectKey(entity, savedId) {
  const category = normaliseCategory(entity?.category);
  if (!category) return '';

  const saved = cleanIdentifier(savedId || entity?.savedId, 160);
  if (saved) return `observation:${category}:saved:${encodeKeyPart(saved)}`;

  const identity = entity?.identityV1;
  if (!isRecord(identity)
    || identity.schemaVersion !== 1
    || cleanText(identity.category, 20) !== category) return '';

  if (identity.status === 'exact') {
    const canonical = cleanText(identity.taxon?.canonicalName, 160).toLowerCase();
    if (canonical) return `observation:${category}:taxon:${encodeKeyPart(canonical)}`;
  }

  const provider = cleanText(identity.provider?.name, 60).toLowerCase();
  const providerId = cleanIdentifier(identity.provider?.id, 160);
  const providerIdSource = cleanText(identity.provenance?.providerId, 160);
  // A proveniencia permite reencontrar o resultado local sem elevar seu status.
  if (provider && providerId && providerIdSource) {
    return `observation:${category}:provider:${encodeKeyPart(provider)}:${encodeKeyPart(providerId)}`;
  }
  return '';
}

function normaliseDefinitions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PROFILE_FIELDS) return null;
  const seen = new Set();
  const definitions = [];
  for (const source of value) {
    if (!isRecord(source)) return null;
    const key = cleanText(source.key, 32);
    if (!FIELD_KEY_PATTERN.test(key) || seen.has(key)) return null;
    seen.add(key);
    if (source.type === 'enum') {
      if (!Array.isArray(source.options) || source.options.length < 1 || source.options.length > MAX_ENUM_OPTIONS) {
        return null;
      }
      const options = source.options.map((option) => cleanText(option, MAX_ENUM_LENGTH));
      if (options.some((option) => !option) || new Set(options).size !== options.length) return null;
      definitions.push({ key, type: 'enum', options, required: source.required === true });
      continue;
    }
    if (source.type === 'text') {
      if (!Number.isInteger(source.maxLength)
        || source.maxLength < 1
        || source.maxLength > MAX_PROFILE_TEXT_LENGTH) return null;
      definitions.push({ key, type: 'text', maxLength: source.maxLength, required: source.required === true });
      continue;
    }
    return null;
  }
  return definitions;
}

function normaliseProfileInput(input) {
  if (!isRecord(input) || input.schemaVersion !== PROFILE_SCHEMA_VERSION || !isRecord(input.fields)) return null;
  const definitions = normaliseDefinitions(input.definitions);
  if (!definitions) return null;
  const allowedKeys = new Set(definitions.map((definition) => definition.key));
  if (Object.keys(input.fields).some((key) => !allowedKeys.has(key))) return null;

  const fields = {};
  for (const definition of definitions) {
    const raw = input.fields[definition.key];
    if (definition.type === 'enum') {
      const value = cleanText(raw, MAX_ENUM_LENGTH);
      if (!value) {
        if (definition.required) return null;
        continue;
      }
      if (!definition.options.includes(value)) return null;
      fields[definition.key] = value;
      continue;
    }
    const value = cleanText(raw, definition.maxLength);
    if (!value) {
      if (definition.required) return null;
      continue;
    }
    fields[definition.key] = value;
  }
  return { schemaVersion: PROFILE_SCHEMA_VERSION, fields };
}

function safeStoredProfile(value) {
  if (!isRecord(value) || value.schemaVersion !== PROFILE_SCHEMA_VERSION) return null;
  const category = normaliseCategory(value.category);
  const subjectKey = normaliseSubjectKey(value.subjectKey);
  const profileId = cleanIdentifier(value.profileId, 80);
  if (!category || categoryFromSubjectKey(subjectKey) !== category || !profileId || !isRecord(value.fields)) return null;
  if (!isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) return null;
  const entries = Object.entries(value.fields);
  if (entries.length > MAX_PROFILE_FIELDS) return null;
  const fields = {};
  for (const [key, raw] of entries) {
    if (!FIELD_KEY_PATTERN.test(key) || typeof raw !== 'string' || raw.length > MAX_PROFILE_TEXT_LENGTH) return null;
    const clean = cleanText(raw, MAX_PROFILE_TEXT_LENGTH);
    if (!clean) return null;
    fields[key] = clean;
  }
  return {
    profileId,
    subjectKey,
    category,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    fields,
    createdAt: normaliseTimestamp(value.createdAt),
    updatedAt: normaliseTimestamp(value.updatedAt),
  };
}

function eventTypeAllowed(category, type) {
  return OBSERVATION_EVENT_TYPES_BY_CATEGORY[category]?.includes(type) === true;
}

function unitAllowed(category, unit) {
  return OBSERVATION_UNITS_BY_CATEGORY[category]?.includes(unit) === true;
}

function normaliseEventInput(category, input) {
  if (!isRecord(input)) return null;
  const type = cleanText(input.type, 40);
  if (!eventTypeAllowed(category, type)) return null;

  const note = cleanText(input.note, MAX_EVENT_NOTE_LENGTH);
  let count = null;
  if (input.count !== undefined && input.count !== null && input.count !== '') {
    if (!Number.isInteger(input.count) || input.count < 0 || input.count > MAX_COUNT) return null;
    count = input.count;
  }

  let measure = null;
  let unit = '';
  if (input.measure !== undefined && input.measure !== null && input.measure !== '') {
    if (typeof input.measure !== 'number'
      || !Number.isFinite(input.measure)
      || Math.abs(input.measure) > MAX_ABSOLUTE_MEASURE) return null;
    measure = input.measure;
    unit = cleanText(input.unit, 24);
    if (!unitAllowed(category, unit)) return null;
  } else if (cleanText(input.unit, 24)) {
    return null;
  }
  if (!note && count === null && measure === null) return null;

  let occurredAt = new Date().toISOString();
  if (input.occurredAt !== undefined) {
    occurredAt = normaliseTimestamp(input.occurredAt);
    if (!occurredAt) return null;
  }
  return { type, note, count, measure, unit, occurredAt };
}

function safeStoredEvent(value) {
  if (!isRecord(value)) return null;
  const eventId = cleanIdentifier(value.eventId, 80);
  const profileId = cleanIdentifier(value.profileId, 80);
  const category = normaliseCategory(value.category);
  const type = cleanText(value.type, 40);
  const note = cleanText(value.note, MAX_EVENT_NOTE_LENGTH);
  if (!eventId || !profileId || !category || !eventTypeAllowed(category, type)) return null;
  const occurredAt = normaliseTimestamp(value.occurredAt);
  if (!occurredAt) return null;

  const count = value.count === null
    ? null
    : Number.isInteger(value.count) && value.count >= 0 && value.count <= MAX_COUNT
      ? value.count
      : undefined;
  if (count === undefined) return null;
  const measure = value.measure === null
    ? null
    : typeof value.measure === 'number'
      && Number.isFinite(value.measure)
      && Math.abs(value.measure) <= MAX_ABSOLUTE_MEASURE
      ? value.measure
      : undefined;
  if (measure === undefined) return null;
  const unit = measure === null ? '' : cleanText(value.unit, 24);
  if ((measure !== null && !unitAllowed(category, unit)) || (!note && count === null && measure === null)) return null;
  return { eventId, profileId, category, occurredAt, type, note, count, measure, unit };
}

function emptyData() {
  return { schemaVersion: DATA_SCHEMA_VERSION, profiles: [], events: [] };
}

function normaliseStoredData(value) {
  if (!isRecord(value)
    || value.schemaVersion !== DATA_SCHEMA_VERSION
    || !Array.isArray(value.profiles)
    || !Array.isArray(value.events)) return emptyData();

  const seenProfileIds = new Set();
  const seenSubjectKeys = new Set();
  const profiles = [];
  for (const source of value.profiles) {
    const profile = safeStoredProfile(source);
    if (!profile || seenProfileIds.has(profile.profileId) || seenSubjectKeys.has(profile.subjectKey)) continue;
    seenProfileIds.add(profile.profileId);
    seenSubjectKeys.add(profile.subjectKey);
    profiles.push(profile);
    if (profiles.length >= MAX_PROFILES) break;
  }

  const profileCategories = new Map(profiles.map((profile) => [profile.profileId, profile.category]));
  const seenEventIds = new Set();
  const perProfile = new Map();
  const events = [];
  for (const source of value.events) {
    const event = safeStoredEvent(source);
    if (!event || seenEventIds.has(event.eventId) || profileCategories.get(event.profileId) !== event.category) continue;
    const count = perProfile.get(event.profileId) || 0;
    if (count >= MAX_EVENTS_PER_PROFILE) continue;
    seenEventIds.add(event.eventId);
    perProfile.set(event.profileId, count + 1);
    events.push(event);
    if (events.length >= MAX_EVENTS) break;
  }
  return { schemaVersion: DATA_SCHEMA_VERSION, profiles, events };
}

async function readData() {
  try {
    const raw = await AsyncStorage.getItem(OBSERVATION_DATA_KEY);
    return raw ? normaliseStoredData(JSON.parse(raw)) : emptyData();
  } catch (e) {
    return emptyData();
  }
}

async function writeData(data) {
  await AsyncStorage.setItem(OBSERVATION_DATA_KEY, JSON.stringify(data));
}

export async function getObservationProfile(subjectKey) {
  const key = normaliseSubjectKey(subjectKey);
  if (!key) return null;
  const data = await readData();
  return data.profiles.find((profile) => profile.subjectKey === key) || null;
}

export function saveObservationProfile(subjectKey, category, input) {
  const key = normaliseSubjectKey(subjectKey);
  const safeCategory = normaliseCategory(category);
  const profileInput = normaliseProfileInput(input);
  if (!key || categoryFromSubjectKey(key) !== safeCategory || !profileInput) return Promise.resolve(null);

  return queueWrite(async () => {
    try {
      const data = await readData();
      const current = data.profiles.find((profile) => profile.subjectKey === key);
      const now = new Date().toISOString();
      const profile = {
        profileId: current?.profileId || uniqueUuid(new Set(data.profiles.map((item) => item.profileId))),
        subjectKey: key,
        category: safeCategory,
        ...profileInput,
        createdAt: current?.createdAt || now,
        updatedAt: now,
      };
      const profiles = [profile, ...data.profiles.filter((item) => item.subjectKey !== key)].slice(0, MAX_PROFILES);
      const retainedIds = new Set(profiles.map((item) => item.profileId));
      const next = {
        schemaVersion: DATA_SCHEMA_VERSION,
        profiles,
        events: data.events.filter((event) => retainedIds.has(event.profileId)),
      };
      await writeData(next);
      return profile;
    } catch (e) {
      return null;
    }
  });
}

export async function getObservationEvents(profileId) {
  const id = cleanIdentifier(profileId, 80);
  if (!id) return [];
  const data = await readData();
  return data.events
    .filter((event) => event.profileId === id)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, MAX_EVENTS_PER_PROFILE);
}

export function appendObservationEvent(profileId, category, input) {
  const id = cleanIdentifier(profileId, 80);
  const safeCategory = normaliseCategory(category);
  const eventInput = normaliseEventInput(safeCategory, input);
  if (!id || !safeCategory || !eventInput) return Promise.resolve(null);

  return queueWrite(async () => {
    try {
      const data = await readData();
      const profile = data.profiles.find((item) => item.profileId === id);
      if (!profile || profile.category !== safeCategory) return null;
      const event = {
        eventId: uniqueUuid(new Set(data.events.map((item) => item.eventId))),
        profileId: id,
        category: safeCategory,
        ...eventInput,
      };
      let profileEventCount = 0;
      const events = [event, ...data.events].filter((item) => {
        if (item.profileId !== id) return true;
        profileEventCount += 1;
        return profileEventCount <= MAX_EVENTS_PER_PROFILE;
      }).slice(0, MAX_EVENTS);
      await writeData({ ...data, events });
      return event;
    } catch (e) {
      return null;
    }
  });
}

export function moveObservationSubject(fromKey, toKey) {
  const sourceKey = normaliseSubjectKey(fromKey);
  const targetKey = normaliseSubjectKey(toKey);
  const category = categoryFromSubjectKey(sourceKey);
  if (!sourceKey
    || !targetKey
    || sourceKey === targetKey
    || category !== categoryFromSubjectKey(targetKey)) return Promise.resolve(null);

  return queueWrite(async () => {
    try {
      const data = await readData();
      const source = data.profiles.find((profile) => profile.subjectKey === sourceKey);
      if (!source || source.category !== category) return null;
      const target = data.profiles.find((profile) => profile.subjectKey === targetKey);
      if (!target) {
        const moved = { ...source, subjectKey: targetKey, updatedAt: new Date().toISOString() };
        const profiles = data.profiles.map((profile) => profile.profileId === source.profileId ? moved : profile);
        await writeData({ ...data, profiles });
        return moved;
      }
      if (target.category !== category) return null;

      const sourceTime = Date.parse(source.updatedAt);
      const targetTime = Date.parse(target.updatedAt);
      const sourceWins = Number.isFinite(sourceTime)
        && (!Number.isFinite(targetTime) || sourceTime > targetTime);
      const winner = sourceWins ? source : target;
      const merged = {
        ...winner,
        profileId: target.profileId,
        subjectKey: targetKey,
        category,
        createdAt: target.createdAt || source.createdAt,
        updatedAt: new Date().toISOString(),
      };
      const profiles = data.profiles
        .filter((profile) => profile.profileId !== source.profileId)
        .map((profile) => profile.profileId === target.profileId ? merged : profile);
      const seen = new Set();
      let mergedCount = 0;
      const events = data.events
        .map((event) => event.profileId === source.profileId
          ? { ...event, profileId: target.profileId }
          : event)
        .filter((event) => {
          if (seen.has(event.eventId)) return false;
          seen.add(event.eventId);
          if (event.profileId !== target.profileId) return true;
          mergedCount += 1;
          return mergedCount <= MAX_EVENTS_PER_PROFILE;
        })
        .slice(0, MAX_EVENTS);
      await writeData({ schemaVersion: DATA_SCHEMA_VERSION, profiles, events });
      return merged;
    } catch (e) {
      return null;
    }
  });
}

export function clearObservationData() {
  return queueWrite(async () => {
    try {
      await AsyncStorage.removeItem(OBSERVATION_DATA_KEY);
      return true;
    } catch (e) {
      return false;
    }
  });
}
