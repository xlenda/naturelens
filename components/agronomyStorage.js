import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AGRONOMY_PROFILE_VERSION,
  migrateAgronomyProfileToV2,
  normalizeAdmin1Code,
  normalizeCountryCode,
  validAgronomyLocationV2,
} from './agronomyProfileV2';

export const AGRONOMY_PROFILES_KEY = '@naturelens_agronomy_profiles_v1';
export const AGRONOMY_EVENTS_KEY = '@naturelens_agronomy_events_v1';

const MAX_PROFILES = 100;
const MAX_EVENTS = 1200;
const MAX_EVENTS_PER_PROFILE = 240;
const EVENT_TYPES = new Set([
  'observation',
  'stage',
  'rain',
  'irrigation',
  'fertilization',
  'pestSample',
  'diseaseCheck',
  'harvest',
]);

let writeTail = Promise.resolve();

function queueWrite(work) {
  const pending = writeTail.then(work, work);
  writeTail = pending.then(() => undefined, () => undefined);
  return pending;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function randomUuid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (e) {
    /* o fallback mantem eventos locais identificaveis */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function exactCanonical(entity) {
  if (entity?.identityV1?.status !== 'exact') return '';
  return cleanText(entity.identityV1?.taxon?.canonicalName, 120).toLowerCase();
}

export function agronomySubjectKey(entity, savedId) {
  const saved = cleanText(savedId || entity?.savedId, 120);
  if (saved) return `saved:${saved}`;

  const canonical = exactCanonical(entity);
  if (canonical) return `taxon:${canonical}`;

  const provider = cleanText(entity?.identityV1?.provider?.name, 40).toLowerCase();
  const providerId = cleanText(entity?.identityV1?.provider?.id || entity?.id, 120);
  if (provider && providerId) return `provider:${provider}:${providerId}`;
  // O catalogo editorial abre fichas sem identityV1. Ele pode receber diario e
  // contexto, mas esse identificador local nunca eleva a identidade tecnica.
  const catalogId = cleanText(entity?.id, 120);
  if (entity?.category === 'crop' && catalogId) return `catalog:${catalogId}`;
  return '';
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function normaliseProfileDraft(value) {
  const source = migrateAgronomyProfileToV2(value);
  if (!source) return null;
  const location = source.location;
  const planting = source.planting;
  const soil = source.soil;
  const date = cleanText(planting.date, 10);

  if (source.schemaVersion !== AGRONOMY_PROFILE_VERSION) return null;
  if (!cleanText(source.purpose, 40) || !cleanText(source.system, 40)) return null;
  if (!validAgronomyLocationV2(location)) return null;
  if (!isIsoDate(date) || cleanText(planting.stage, 80).length < 1 || planting.stageConfirmed !== true) return null;
  if (cleanText(soil.description, 160).length < 2 || typeof soil.hasReport !== 'boolean') return null;

  return {
    schemaVersion: AGRONOMY_PROFILE_VERSION,
    purpose: cleanText(source.purpose, 40),
    system: cleanText(source.system, 40),
    location: {
      countryCode: normalizeCountryCode(location.countryCode),
      admin1Code: normalizeAdmin1Code(location.admin1Code, location.countryCode),
      locality: cleanText(location.locality, 80),
    },
    planting: {
      date,
      stage: cleanText(planting.stage, 80),
      stageConfirmed: true,
    },
    soil: {
      description: cleanText(soil.description, 160),
      hasReport: soil.hasReport,
    },
  };
}

async function readList(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export async function getAgronomyProfiles() {
  const profiles = await readList(AGRONOMY_PROFILES_KEY);
  // Migracao preguicosa: a leitura entrega V2 imediatamente, mas nao escreve
  // fora da fila. O proximo save ou move persiste a forma nova sem disputar
  // com uma gravacao de perfil/evento que esteja em andamento.
  return profiles.map((profile) => {
    const draft = normaliseProfileDraft(profile);
    return draft ? { ...profile, ...draft } : profile;
  });
}

export async function getAgronomyProfile(subjectKey) {
  const key = cleanText(subjectKey, 220);
  if (!key) return null;
  const profiles = await getAgronomyProfiles();
  return profiles.find((profile) => profile?.subjectKey === key) || null;
}

export function saveAgronomyProfile({ subjectKey, entity, draft }) {
  const key = cleanText(subjectKey, 220);
  const profileDraft = normaliseProfileDraft(draft);
  if (!key || !profileDraft || entity?.category !== 'crop') return Promise.resolve(null);

  return queueWrite(async () => {
    try {
      const profiles = await getAgronomyProfiles();
      const index = profiles.findIndex((profile) => profile?.subjectKey === key);
      const current = index >= 0 ? profiles[index] : null;
      const now = new Date().toISOString();
      const profile = {
        profileId: current?.profileId || randomUuid(),
        subjectKey: key,
        category: 'crop',
        entityName: cleanText(entity?.name, 120),
        scientific: cleanText(entity?.identityV1?.taxon?.canonicalName || entity?.scientific, 120),
        identityStatus: cleanText(entity?.identityV1?.status, 20) || 'legacy',
        createdAt: current?.createdAt || now,
        updatedAt: now,
        ...profileDraft,
      };
      const next = profiles.slice();
      if (index >= 0) next[index] = profile;
      else next.unshift(profile);
      await AsyncStorage.setItem(AGRONOMY_PROFILES_KEY, JSON.stringify(next.slice(0, MAX_PROFILES)));
      return profile;
    } catch (e) {
      return null;
    }
  });
}

export function moveAgronomyProfileSubject(fromSubjectKey, toSubjectKey) {
  const fromKey = cleanText(fromSubjectKey, 220);
  const toKey = cleanText(toSubjectKey, 220);
  if (!fromKey || !toKey || fromKey === toKey) return Promise.resolve(null);

  return queueWrite(async () => {
    try {
      const profiles = await getAgronomyProfiles();
      const sourceIndex = profiles.findIndex((profile) => profile?.subjectKey === fromKey);
      if (sourceIndex < 0) return null;
      const target = profiles.find((profile) => profile?.subjectKey === toKey);
      if (target) {
        const source = profiles[sourceIndex];
        const sourceTime = Date.parse(source?.updatedAt);
        const targetTime = Date.parse(target?.updatedAt);
        const sourceWins = Number.isFinite(sourceTime)
          && (!Number.isFinite(targetTime) || sourceTime > targetTime);
        const winner = sourceWins ? source : target;
        const merged = {
          ...winner,
          profileId: target.profileId,
          subjectKey: toKey,
          createdAt: target.createdAt || source.createdAt,
          updatedAt: new Date().toISOString(),
        };

        // Dois caminhos podem criar o mesmo talhao antes de um save. Ao unir
        // as chaves, os eventos migram para o destino em vez de ficarem orfaos.
        const events = await readList(AGRONOMY_EVENTS_KEY);
        const seenEvents = new Set();
        const mergedEvents = events
          .map((event) => event?.profileId === source.profileId
            ? { ...event, profileId: target.profileId }
            : event)
          .filter((event) => {
            if (!event?.eventId || seenEvents.has(event.eventId)) return false;
            seenEvents.add(event.eventId);
            return true;
          })
          .slice(0, MAX_EVENTS);
        const mergedProfiles = profiles
          .filter((profile) => profile?.subjectKey !== fromKey)
          .map((profile) => profile?.subjectKey === toKey ? merged : profile);
        await AsyncStorage.setItem(AGRONOMY_EVENTS_KEY, JSON.stringify(mergedEvents));
        await AsyncStorage.setItem(AGRONOMY_PROFILES_KEY, JSON.stringify(mergedProfiles));
        return merged;
      }
      const next = profiles.slice();
      next[sourceIndex] = {
        ...next[sourceIndex],
        subjectKey: toKey,
        updatedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(AGRONOMY_PROFILES_KEY, JSON.stringify(next));
      return next[sourceIndex];
    } catch (e) {
      return null;
    }
  });
}

function normaliseEventDraft(profileId, value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const type = cleanText(source.type, 32);
  if (!cleanText(profileId, 80) || !EVENT_TYPES.has(type)) return null;
  const amount = Number.isFinite(source.amount) ? source.amount : null;
  if (amount !== null && (amount < 0 || amount > 1000000)) return null;
  return {
    type,
    note: cleanText(source.note, 500),
    amount,
    unit: amount === null ? '' : cleanText(source.unit, 24),
    stage: cleanText(source.stage, 80),
  };
}

export async function getAgronomyEvents(profileId) {
  const key = cleanText(profileId, 80);
  if (!key) return [];
  const events = await readList(AGRONOMY_EVENTS_KEY);
  return events
    .filter((event) => event?.profileId === key)
    .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
    .slice(0, MAX_EVENTS_PER_PROFILE);
}

export function appendAgronomyEvent(profileId, draft) {
  const eventDraft = normaliseEventDraft(profileId, draft);
  if (!eventDraft) return Promise.resolve(null);

  return queueWrite(async () => {
    try {
      const profiles = await getAgronomyProfiles();
      if (!profiles.some((profile) => profile?.profileId === profileId)) return null;
      const events = await readList(AGRONOMY_EVENTS_KEY);
      const event = {
        eventId: randomUuid(),
        profileId,
        occurredAt: new Date().toISOString(),
        ...eventDraft,
      };
      await AsyncStorage.setItem(AGRONOMY_EVENTS_KEY, JSON.stringify([event, ...events].slice(0, MAX_EVENTS)));
      return event;
    } catch (e) {
      return null;
    }
  });
}

export function clearAgronomyData() {
  return queueWrite(async () => {
    try {
      await AsyncStorage.removeItem(AGRONOMY_PROFILES_KEY);
      await AsyncStorage.removeItem(AGRONOMY_EVENTS_KEY);
      return true;
    } catch (e) {
      return false;
    }
  });
}

export const AGRONOMY_EVENT_TYPES = Object.freeze(Array.from(EVENT_TYPES));
