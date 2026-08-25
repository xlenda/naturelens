import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AGRONOMY_EVENT_TYPES } from './agronomyStorage';
import {
  OBSERVATION_CATEGORIES,
  OBSERVATION_EVENT_TYPES_BY_CATEGORY,
} from './observationStorage';
import * as NotificationAdapter from './notificationAdapter';

export const LOCAL_REMINDERS_KEY = '@naturelens_local_reminders_v1';
export const LOCAL_REMINDER_REPEATS = Object.freeze(['once', 'daily', 'weekly']);
export const LOCAL_REMINDER_CATEGORIES = Object.freeze([...OBSERVATION_CATEGORIES, 'crop']);
export const MAX_LOCAL_REMINDERS = 64;
export const MAX_LOCAL_REMINDERS_PER_SAVED_ID = 12;

const DATA_SCHEMA_VERSION = 1;
const REMINDER_SCHEMA_VERSION = 1;
const MAX_SAVED_ID_LENGTH = 160;
const MAX_NOTIFICATION_ID_LENGTH = 240;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 320;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_SAVED_ID_PATTERN = /^\d{10,20}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const CATEGORY_SET = new Set(LOCAL_REMINDER_CATEGORIES);
const REPEAT_SET = new Set(LOCAL_REMINDER_REPEATS);
const AGRONOMY_EVENT_SET = new Set(AGRONOMY_EVENT_TYPES);

let writeTail = Promise.resolve();

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

function exactIdentifier(value, maxLength) {
  if (typeof value !== 'string'
    || value.length < 1
    || value.length > maxLength
    || value !== value.trim()
    || /[\u0000-\u001f\u007f]/.test(value)) return '';
  return value;
}

function stableSavedId(value) {
  const savedId = exactIdentifier(value, MAX_SAVED_ID_LENGTH);
  return UUID_PATTERN.test(savedId) || LEGACY_SAVED_ID_PATTERN.test(savedId) ? savedId : '';
}

function normaliseTimestamp(value, requireFuture = false) {
  if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value)) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || (requireFuture && timestamp <= Date.now())) return '';
  return new Date(timestamp).toISOString();
}

function actionAllowed(category, actionKey) {
  if (category === 'crop') return AGRONOMY_EVENT_SET.has(actionKey);
  return OBSERVATION_EVENT_TYPES_BY_CATEGORY[category]?.includes(actionKey) === true;
}

function uniqueUuid(existing) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const candidate = Crypto.randomUUID();
      if (UUID_PATTERN.test(candidate) && !existing.has(candidate)) return candidate;
    } catch (e) {
      return '';
    }
  }
  return '';
}

function normaliseCreateInput(value) {
  if (!isRecord(value)) return null;
  const savedId = stableSavedId(value.savedId);
  const category = cleanText(value.category, 20);
  const actionKey = cleanText(value.actionKey, 40);
  const nextAt = normaliseTimestamp(value.nextAt, true);
  const repeat = cleanText(value.repeat, 12);
  const title = cleanText(value.title, MAX_TITLE_LENGTH);
  const body = cleanText(value.body, MAX_BODY_LENGTH);
  if (!savedId
    || !CATEGORY_SET.has(category)
    || !actionAllowed(category, actionKey)
    || !nextAt
    || !REPEAT_SET.has(repeat)
    || !title
    || !body) return null;
  return { savedId, category, actionKey, nextAt, repeat, title, body };
}

function safeStoredReminder(value) {
  if (!isRecord(value) || value.schemaVersion !== REMINDER_SCHEMA_VERSION) return null;
  const savedId = stableSavedId(value.savedId);
  const reminderId = exactIdentifier(value.reminderId, 80);
  const notificationId = exactIdentifier(value.notificationId, MAX_NOTIFICATION_ID_LENGTH);
  const category = cleanText(value.category, 20);
  const actionKey = cleanText(value.actionKey, 40);
  const nextAt = normaliseTimestamp(value.nextAt);
  const repeat = cleanText(value.repeat, 12);
  const title = cleanText(value.title, MAX_TITLE_LENGTH);
  const body = cleanText(value.body, MAX_BODY_LENGTH);
  const createdAt = normaliseTimestamp(value.createdAt);
  const updatedAt = normaliseTimestamp(value.updatedAt);
  if (!savedId
    || !reminderId
    || !notificationId
    || !CATEGORY_SET.has(category)
    || !actionAllowed(category, actionKey)
    || !nextAt
    || !REPEAT_SET.has(repeat)
    || !title
    || !body
    || !createdAt
    || !updatedAt) return null;
  return {
    schemaVersion: REMINDER_SCHEMA_VERSION,
    reminderId,
    notificationId,
    savedId,
    category,
    actionKey,
    nextAt,
    repeat,
    title,
    body,
    createdAt,
    updatedAt,
  };
}

function normaliseStoredData(value) {
  if (!isRecord(value)
    || value.schemaVersion !== DATA_SCHEMA_VERSION
    || !Array.isArray(value.reminders)) return null;
  const reminders = [];
  const reminderIds = new Set();
  const notificationIds = new Set();
  const perSavedId = new Map();
  for (const source of value.reminders) {
    const reminder = safeStoredReminder(source);
    if (!reminder
      || reminderIds.has(reminder.reminderId)
      || notificationIds.has(reminder.notificationId)) continue;
    const count = perSavedId.get(reminder.savedId) || 0;
    if (count >= MAX_LOCAL_REMINDERS_PER_SAVED_ID) continue;
    reminderIds.add(reminder.reminderId);
    notificationIds.add(reminder.notificationId);
    perSavedId.set(reminder.savedId, count + 1);
    reminders.push(reminder);
    if (reminders.length >= MAX_LOCAL_REMINDERS) break;
  }
  return { schemaVersion: DATA_SCHEMA_VERSION, reminders };
}

async function readDataResult() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_REMINDERS_KEY);
    if (raw === null) return { ok: true, data: { schemaVersion: DATA_SCHEMA_VERSION, reminders: [] } };
    const data = normaliseStoredData(JSON.parse(raw));
    return data ? { ok: true, data } : { ok: false, data: null };
  } catch (e) {
    return { ok: false, data: null };
  }
}

async function writeData(data) {
  if (data.reminders.length === 0) {
    await AsyncStorage.removeItem(LOCAL_REMINDERS_KEY);
    return;
  }
  await AsyncStorage.setItem(LOCAL_REMINDERS_KEY, JSON.stringify(data));
}

function publicReminder(reminder) {
  return { ...reminder };
}

function strictPayload(value) {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== 3
    || keys[0] !== 'reminderId'
    || keys[1] !== 'savedId'
    || keys[2] !== 'type'
    || value.type !== 'specimen-reminder') return null;
  const savedId = stableSavedId(value.savedId);
  const reminderId = exactIdentifier(value.reminderId, 80);
  return savedId && reminderId ? { savedId, reminderId } : null;
}

function responsePayload(response) {
  return strictPayload(response?.notification?.request?.content?.data);
}

function unsupportedResult() {
  return { ok: false, status: 'unsupported', permissionStatus: 'unsupported' };
}

async function permissionForCreate() {
  let permission = await NotificationAdapter.getReminderPermissionStatus();
  if (permission?.status === 'granted') return 'granted';
  if (permission?.status === 'error') return 'error';
  if (permission?.status === 'unsupported') return 'unsupported';
  if (permission?.status === 'denied' && permission?.canAskAgain === false) return 'denied';
  permission = await NotificationAdapter.requestReminderPermission();
  if (permission?.status === 'granted') return 'granted';
  if (permission?.status === 'error') return 'error';
  if (permission?.status === 'unsupported') return 'unsupported';
  return 'denied';
}

export function isNativeReminderAvailable() {
  try {
    return NotificationAdapter.isNotificationAdapterAvailable() === true;
  } catch (e) {
    return false;
  }
}

export async function listLocalReminders(savedId) {
  if (!isNativeReminderAvailable()) return [];
  const filterId = savedId === undefined ? '' : stableSavedId(savedId);
  if (savedId !== undefined && !filterId) return [];
  const result = await readDataResult();
  if (!result.ok) return [];
  return result.data.reminders
    .filter((reminder) => !filterId || reminder.savedId === filterId)
    .sort((left, right) => left.nextAt.localeCompare(right.nextAt))
    .map(publicReminder);
}

export function createLocalReminder(input) {
  const draft = normaliseCreateInput(input);
  if (!draft) return Promise.resolve({ ok: false, status: 'invalid' });
  if (!isNativeReminderAvailable()) return Promise.resolve(unsupportedResult());

  return queueWrite(async () => {
    const current = await readDataResult();
    if (!current.ok) return { ok: false, status: 'error', permissionStatus: 'error' };
    if (current.data.reminders.length >= MAX_LOCAL_REMINDERS
      || current.data.reminders.filter((item) => item.savedId === draft.savedId).length
        >= MAX_LOCAL_REMINDERS_PER_SAVED_ID) {
      return { ok: false, status: 'limit' };
    }
    const reminderId = uniqueUuid(new Set(current.data.reminders.map((item) => item.reminderId)));
    if (!reminderId) return { ok: false, status: 'error', permissionStatus: 'error' };

    try {
      // O Android precisa do canal criado antes de abrir o dialogo de permissao.
      if (await NotificationAdapter.ensureReminderChannel() !== true) return unsupportedResult();
    } catch (e) {
      return { ok: false, status: 'error', permissionStatus: 'error' };
    }

    let permissionStatus;
    try {
      permissionStatus = await permissionForCreate();
    } catch (e) {
      return { ok: false, status: 'error', permissionStatus: 'error' };
    }
    if (permissionStatus !== 'granted') {
      return { ok: false, status: permissionStatus, permissionStatus };
    }

    const payload = Object.freeze({
      type: 'specimen-reminder',
      savedId: draft.savedId,
      reminderId,
    });
    let scheduled;
    try {
      scheduled = await NotificationAdapter.scheduleReminderNotification({
        title: draft.title,
        body: draft.body,
        nextAt: draft.nextAt,
        repeat: draft.repeat,
        data: payload,
      });
    } catch (e) {
      return { ok: false, status: 'error', permissionStatus: 'granted' };
    }

    const notificationId = exactIdentifier(scheduled?.notificationId, MAX_NOTIFICATION_ID_LENGTH);
    const nextAt = normaliseTimestamp(scheduled?.nextAt, true);
    if (!notificationId || !nextAt) {
      if (notificationId) {
        try { await NotificationAdapter.cancelReminderNotification(notificationId); } catch (e) { /* reconciliacao remove o orfao */ }
      }
      return { ok: false, status: 'error', permissionStatus: 'granted' };
    }

    const now = new Date().toISOString();
    const reminder = {
      schemaVersion: REMINDER_SCHEMA_VERSION,
      reminderId,
      notificationId,
      savedId: draft.savedId,
      category: draft.category,
      actionKey: draft.actionKey,
      nextAt,
      repeat: draft.repeat,
      title: draft.title,
      body: draft.body,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await writeData({
        schemaVersion: DATA_SCHEMA_VERSION,
        reminders: [...current.data.reminders, reminder],
      });
    } catch (e) {
      try { await NotificationAdapter.cancelReminderNotification(notificationId); } catch (cancelError) { /* reconciliacao remove o orfao */ }
      return { ok: false, status: 'error', permissionStatus: 'granted' };
    }
    return {
      ok: true,
      status: 'scheduled',
      permissionStatus: 'granted',
      reminder: publicReminder(reminder),
    };
  });
}

async function cancelMatching(predicate, emptyStatus = 'not-found') {
  const current = await readDataResult();
  if (!current.ok) return { ok: false, status: 'error', removed: 0 };
  const targets = current.data.reminders.filter(predicate);
  if (targets.length === 0) return { ok: emptyStatus !== 'not-found', status: emptyStatus, removed: 0 };

  const cancelled = new Set();
  for (const reminder of targets) {
    try {
      if (await NotificationAdapter.cancelReminderNotification(reminder.notificationId) === true) {
        cancelled.add(reminder.reminderId);
      }
    } catch (e) {
      /* o registro permanece para uma nova tentativa */
    }
  }
  const reminders = current.data.reminders.filter((item) => !cancelled.has(item.reminderId));
  try {
    await writeData({ schemaVersion: DATA_SCHEMA_VERSION, reminders });
  } catch (e) {
    return { ok: false, status: 'error', removed: cancelled.size };
  }
  const complete = cancelled.size === targets.length;
  return {
    ok: complete,
    status: complete ? 'cancelled' : 'error',
    removed: cancelled.size,
    failed: targets.length - cancelled.size,
  };
}

export function removeLocalReminder(reminderId) {
  const id = exactIdentifier(reminderId, 80);
  if (!id) return Promise.resolve({ ok: false, status: 'invalid', removed: 0 });
  if (!isNativeReminderAvailable()) return Promise.resolve(unsupportedResult());
  return queueWrite(() => cancelMatching((reminder) => reminder.reminderId === id));
}

export function cancelRemindersForSavedId(savedId) {
  const id = stableSavedId(savedId);
  if (!id) return Promise.resolve({ ok: false, status: 'invalid', removed: 0 });
  if (!isNativeReminderAvailable()) return Promise.resolve(unsupportedResult());
  return queueWrite(() => cancelMatching((reminder) => reminder.savedId === id, 'cancelled'));
}

export function clearLocalReminders() {
  if (!isNativeReminderAvailable()) return Promise.resolve(unsupportedResult());
  return queueWrite(async () => {
    const current = await readDataResult();
    let scheduled;
    let scheduledReadFailed = false;
    try {
      scheduled = await NotificationAdapter.getScheduledReminderNotifications();
    } catch (e) {
      scheduled = [];
      scheduledReadFailed = true;
    }
    const notificationIds = new Set(current.ok
      ? current.data.reminders.map((reminder) => reminder.notificationId)
      : []);
    for (const request of Array.isArray(scheduled) ? scheduled : []) {
      if (request?.data?.type === 'specimen-reminder'
        && exactIdentifier(request.notificationId, MAX_NOTIFICATION_ID_LENGTH)) {
        notificationIds.add(request.notificationId);
      }
    }
    let failed = 0;
    for (const notificationId of notificationIds) {
      try {
        if (await NotificationAdapter.cancelReminderNotification(notificationId) !== true) failed += 1;
      } catch (e) {
        failed += 1;
      }
    }
    if (failed > 0 || scheduledReadFailed) {
      return {
        ok: false,
        status: 'error',
        removed: notificationIds.size - failed,
        failed: failed + (scheduledReadFailed ? 1 : 0),
      };
    }
    try {
      await AsyncStorage.removeItem(LOCAL_REMINDERS_KEY);
      return { ok: true, status: 'cleared', removed: notificationIds.size, failed: 0 };
    } catch (e) {
      return { ok: false, status: 'error', removed: notificationIds.size, failed: 0 };
    }
  });
}

export function reconcileLocalReminders() {
  if (!isNativeReminderAvailable()) return Promise.resolve(unsupportedResult());
  return queueWrite(async () => {
    const current = await readDataResult();
    if (!current.ok) return { ok: false, status: 'error', removed: 0, reminders: [] };
    let scheduled;
    try {
      scheduled = await NotificationAdapter.getScheduledReminderNotifications();
    } catch (e) {
      return { ok: false, status: 'error', removed: 0, reminders: current.data.reminders.map(publicReminder) };
    }
    const requests = new Map();
    for (const request of Array.isArray(scheduled) ? scheduled : []) {
      const notificationId = exactIdentifier(request?.notificationId, MAX_NOTIFICATION_ID_LENGTH);
      if (notificationId) requests.set(notificationId, request);
    }

    const retained = [];
    const retainedNotificationIds = new Set();
    const invalidNotificationIds = new Set();
    for (const reminder of current.data.reminders) {
      const request = requests.get(reminder.notificationId);
      const payload = strictPayload(request?.data);
      const nextAt = normaliseTimestamp(request?.nextAt, true);
      if (!request
        || !payload
        || payload.savedId !== reminder.savedId
        || payload.reminderId !== reminder.reminderId
        || !nextAt) {
        if (request) invalidNotificationIds.add(reminder.notificationId);
        continue;
      }
      retainedNotificationIds.add(reminder.notificationId);
      retained.push(nextAt === reminder.nextAt ? reminder : {
        ...reminder,
        nextAt,
        updatedAt: new Date().toISOString(),
      });
    }

    for (const [notificationId, request] of requests) {
      if (request?.data?.type === 'specimen-reminder'
        && !retainedNotificationIds.has(notificationId)) invalidNotificationIds.add(notificationId);
    }
    let cancelFailures = 0;
    for (const notificationId of invalidNotificationIds) {
      try {
        if (await NotificationAdapter.cancelReminderNotification(notificationId) !== true) cancelFailures += 1;
      } catch (e) {
        cancelFailures += 1;
      }
    }
    if (cancelFailures > 0) {
      return {
        ok: false,
        status: 'error',
        removed: 0,
        cancelledOrphans: invalidNotificationIds.size - cancelFailures,
        reminders: current.data.reminders.map(publicReminder),
      };
    }
    try {
      await writeData({ schemaVersion: DATA_SCHEMA_VERSION, reminders: retained });
    } catch (e) {
      return { ok: false, status: 'error', removed: current.data.reminders.length - retained.length, reminders: retained.map(publicReminder) };
    }
    return {
      ok: true,
      status: 'reconciled',
      removed: current.data.reminders.length - retained.length,
      cancelledOrphans: invalidNotificationIds.size - cancelFailures,
      reminders: retained.map(publicReminder),
    };
  });
}

async function targetFromResponse(response) {
  const payload = responsePayload(response);
  if (!payload) return null;
  // O agendamento once ja saiu da lista nativa quando o toque abre o app. O
  // payload estrito criado pelo agendamento precisa sobreviver ao reconcile.
  return {
    type: 'specimen-reminder',
    savedId: payload.savedId,
    reminderId: payload.reminderId,
  };
}

async function consumeResponse(response) {
  const target = await targetFromResponse(response);
  if (!target) return null;
  try {
    // Sem confirmar o consumo, o Expo devolveria o mesmo toque no proximo boot.
    if (await NotificationAdapter.clearLastReminderResponse() !== true) return null;
  } catch (e) {
    return null;
  }
  return target;
}

export async function getInitialReminderResponse() {
  if (!isNativeReminderAvailable()) return null;
  try {
    return await consumeResponse(await NotificationAdapter.getLastReminderResponse());
  } catch (e) {
    return null;
  }
}

export function subscribeReminderResponses(handler) {
  if (!isNativeReminderAvailable() || typeof handler !== 'function') return { remove() {} };
  let active = true;
  let subscription;
  try {
    subscription = NotificationAdapter.subscribeNotificationResponses((response) => {
      consumeResponse(response).then((target) => {
        if (active && target) handler(target);
      }).catch(() => undefined);
    });
  } catch (e) {
    return { remove() {} };
  }
  return {
    remove() {
      active = false;
      try { subscription?.remove?.(); } catch (e) { /* listener nativo ja foi removido */ }
    },
  };
}
