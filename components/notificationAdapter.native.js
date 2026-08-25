import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const LOCAL_REMINDER_CHANNEL_ID = 'naturelens-reminders-v1';

// Sem handler o Android recebe o evento, mas esconde o banner enquanto o app
// esta aberto. A mesma regra deixa o lembrete visivel dentro ou fora do app.
if (Platform.OS === 'android' && typeof Notifications.setNotificationHandler === 'function') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function adapterReady() {
  return Platform.OS === 'android'
    && typeof Notifications.setNotificationChannelAsync === 'function'
    && typeof Notifications.getPermissionsAsync === 'function'
    && typeof Notifications.requestPermissionsAsync === 'function'
    && typeof Notifications.scheduleNotificationAsync === 'function'
    && typeof Notifications.cancelScheduledNotificationAsync === 'function'
    && typeof Notifications.getAllScheduledNotificationsAsync === 'function';
}

function permissionResult(value) {
  if (value?.status === 'granted' || value?.granted === true) {
    return { status: 'granted', canAskAgain: false };
  }
  if (value?.status === 'denied' || value?.canAskAgain === false) {
    return { status: 'denied', canAskAgain: value?.canAskAgain !== false };
  }
  return { status: 'prompt', canAskAgain: true };
}

function fallbackNextDate(trigger, now = new Date()) {
  if (trigger.type === 'date') {
    const timestamp = trigger.date instanceof Date ? trigger.date.getTime() : Number(trigger.date);
    return Number.isFinite(timestamp) && timestamp > now.getTime() ? timestamp : null;
  }

  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setHours(trigger.hour, trigger.minute, 0, 0);
  if (trigger.type === 'daily') {
    if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
    return candidate.getTime();
  }

  if (trigger.type === 'weekly') {
    const targetDay = trigger.weekday - 1;
    const delta = (targetDay - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + delta);
    if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 7);
    return candidate.getTime();
  }
  return null;
}

function reminderTrigger(nextAt, repeat) {
  const date = new Date(nextAt);
  if (repeat === 'once') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: LOCAL_REMINDER_CHANNEL_ID,
    };
  }
  if (repeat === 'daily') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: date.getHours(),
      minute: date.getMinutes(),
      channelId: LOCAL_REMINDER_CHANNEL_ID,
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    weekday: date.getDay() + 1,
    hour: date.getHours(),
    minute: date.getMinutes(),
    channelId: LOCAL_REMINDER_CHANNEL_ID,
  };
}

async function nextTriggerTimestamp(trigger) {
  if (typeof Notifications.getNextTriggerDateAsync === 'function') {
    try {
      const timestamp = await Notifications.getNextTriggerDateAsync(trigger);
      if (Number.isFinite(timestamp) && timestamp > Date.now()) return timestamp;
    } catch (e) {
      /* o calculo local preserva o lembrete quando a API nativa nao responde */
    }
  }
  return fallbackNextDate(trigger);
}

export function isNotificationAdapterAvailable() {
  return adapterReady();
}

export async function ensureReminderChannel() {
  if (!adapterReady()) return false;
  await Notifications.setNotificationChannelAsync(LOCAL_REMINDER_CHANNEL_ID, {
    name: 'NatureLens',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 180, 250],
    lightColor: '#2D6A4F',
  });
  return true;
}

export async function getReminderPermissionStatus() {
  if (!adapterReady()) return { status: 'unsupported', canAskAgain: false };
  try {
    return permissionResult(await Notifications.getPermissionsAsync());
  } catch (e) {
    return { status: 'error', canAskAgain: false };
  }
}

export async function requestReminderPermission() {
  if (!adapterReady()) return { status: 'unsupported', canAskAgain: false };
  try {
    return permissionResult(await Notifications.requestPermissionsAsync());
  } catch (e) {
    return { status: 'error', canAskAgain: false };
  }
}

export async function scheduleReminderNotification({ title, body, nextAt, repeat, data }) {
  if (!adapterReady()) throw new Error('notifications-unavailable');
  const trigger = reminderTrigger(nextAt, repeat);
  const nextTimestamp = await nextTriggerTimestamp(trigger);
  if (!Number.isFinite(nextTimestamp)) throw new Error('notification-trigger-invalid');
  const requestedTimestamp = Date.parse(nextAt);
  const tolerance = repeat === 'once' ? 1000 : 60000;
  // DAILY e WEEKLY nao carregam uma data inicial. Se o proximo ciclo calculado
  // nao for o escolhido, agendar criaria um lembrete antecipado e enganoso.
  if (!Number.isFinite(requestedTimestamp)
    || Math.abs(nextTimestamp - requestedTimestamp) > tolerance) {
    throw new Error('notification-first-trigger-mismatch');
  }
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: 'default' },
    trigger,
  });
  if (typeof notificationId !== 'string' || !notificationId) {
    throw new Error('notification-id-invalid');
  }
  return { notificationId, nextAt: new Date(nextTimestamp).toISOString() };
}

export async function cancelReminderNotification(notificationId) {
  if (!adapterReady()) return false;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
  return true;
}

export async function getScheduledReminderNotifications() {
  if (!adapterReady()) return [];
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const result = [];
  for (const request of Array.isArray(scheduled) ? scheduled : []) {
    const notificationId = typeof request?.identifier === 'string' ? request.identifier : '';
    if (!notificationId) continue;
    const timestamp = await nextTriggerTimestamp(request.trigger || {});
    result.push({
      notificationId,
      data: request?.content?.data,
      nextAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
    });
  }
  return result;
}

export async function getLastReminderResponse() {
  if (!adapterReady() || typeof Notifications.getLastNotificationResponseAsync !== 'function') return null;
  return Notifications.getLastNotificationResponseAsync();
}

export async function clearLastReminderResponse() {
  if (!adapterReady() || typeof Notifications.clearLastNotificationResponseAsync !== 'function') return false;
  await Notifications.clearLastNotificationResponseAsync();
  return true;
}

export function subscribeNotificationResponses(handler) {
  if (!adapterReady() || typeof Notifications.addNotificationResponseReceivedListener !== 'function') {
    return { remove() {} };
  }
  return Notifications.addNotificationResponseReceivedListener(handler);
}
