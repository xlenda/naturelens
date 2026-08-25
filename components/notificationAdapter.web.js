export const LOCAL_REMINDER_CHANNEL_ID = '';

export function isNotificationAdapterAvailable() {
  return false;
}

export async function ensureReminderChannel() {
  return false;
}

export async function getReminderPermissionStatus() {
  return { status: 'unsupported', canAskAgain: false };
}

export async function requestReminderPermission() {
  return { status: 'unsupported', canAskAgain: false };
}

export async function scheduleReminderNotification() {
  throw new Error('notifications-unavailable');
}

export async function cancelReminderNotification() {
  return false;
}

export async function getScheduledReminderNotifications() {
  return [];
}

export async function getLastReminderResponse() {
  return null;
}

export async function clearLastReminderResponse() {
  return false;
}

export function subscribeNotificationResponses() {
  return { remove() {} };
}
