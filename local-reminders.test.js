const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

const SAVED_A = '11111111-1111-4111-8111-111111111111';
const SAVED_B = '22222222-2222-4222-8222-222222222222';

const observationTypes = {
  plant: ['observation', 'growth', 'leafChange', 'flowering', 'fruiting', 'symptom', 'care'],
  tree: ['observation', 'growth', 'leafChange', 'flowering', 'fruiting', 'symptom', 'habitat'],
  insect: ['observation', 'count', 'lifeStage', 'behavior', 'interaction', 'habitat'],
  mushroom: ['observation', 'emergence', 'morphology', 'substrate', 'colorChange', 'sporePrint'],
  fish: ['observation', 'count', 'behavior', 'habitat', 'waterReading', 'feeding'],
  bird: ['observation', 'count', 'behavior', 'vocalization', 'nesting', 'flight'],
  sound: ['observation', 'recording', 'comparison', 'context', 'frequency', 'amplitude'],
};
const agronomyTypes = [
  'observation', 'stage', 'rain', 'irrigation', 'fertilization', 'pestSample', 'diseaseCheck', 'harvest',
];

function future(minutes = 60) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

function loadCore(options = {}) {
  const values = new Map(Object.entries(options.seed || {}));
  const calls = [];
  const scheduled = new Map();
  const listeners = new Set();
  let sequence = 0;
  let failSet = options.failSet === true;
  let failRemove = options.failRemove === true;
  let cancelFailures = new Set(options.cancelFailures || []);
  let permission = options.permission || { status: 'granted', canAskAgain: false };
  let requestedPermission = options.requestedPermission || { status: 'granted', canAskAgain: false };
  let initialResponse = options.initialResponse || null;
  let cryptoSequence = 0;

  const asyncStorage = {
    async getItem(key) {
      calls.push(`storage:get:${key}`);
      if (options.failGet) throw new Error('get failed');
      return values.has(key) ? values.get(key) : null;
    },
    async setItem(key, value) {
      calls.push(`storage:set:${key}`);
      if (failSet) throw new Error('set failed');
      values.set(key, value);
    },
    async removeItem(key) {
      calls.push(`storage:remove:${key}`);
      if (failRemove) throw new Error('remove failed');
      values.delete(key);
    },
  };
  const adapter = {
    isNotificationAdapterAvailable() {
      calls.push('available');
      return options.available !== false;
    },
    async ensureReminderChannel() {
      calls.push('channel');
      if (options.channelThrows) throw new Error('channel failed');
      return options.channelResult !== false;
    },
    async getReminderPermissionStatus() {
      calls.push('permission:get');
      return permission;
    },
    async requestReminderPermission() {
      calls.push('permission:request');
      return requestedPermission;
    },
    async scheduleReminderNotification(input) {
      calls.push('schedule');
      if (options.scheduleThrows) throw new Error('schedule failed');
      sequence += 1;
      const notificationId = `native-${sequence}`;
      const nextAt = options.invalidScheduledDate ? 'invalid' : input.nextAt;
      scheduled.set(notificationId, {
        notificationId,
        data: { ...input.data },
        nextAt,
        input,
      });
      return { notificationId, nextAt };
    },
    async cancelReminderNotification(notificationId) {
      calls.push(`cancel:${notificationId}`);
      if (cancelFailures.has(notificationId)) throw new Error('cancel failed');
      scheduled.delete(notificationId);
      return true;
    },
    async getScheduledReminderNotifications() {
      calls.push('scheduled:list');
      if (options.scheduledThrows) throw new Error('scheduled failed');
      return Array.from(scheduled.values()).map((item) => ({
        notificationId: item.notificationId,
        data: { ...item.data },
        nextAt: item.nextAt,
      }));
    },
    async getLastReminderResponse() {
      calls.push('response:last');
      return initialResponse;
    },
    async clearLastReminderResponse() {
      calls.push('response:clear');
      if (options.clearResponseThrows) throw new Error('clear failed');
      initialResponse = null;
      return true;
    },
    subscribeNotificationResponses(handler) {
      calls.push('response:subscribe');
      listeners.add(handler);
      return { remove() { listeners.delete(handler); } };
    },
  };

  const file = path.join(__dirname, 'components/localReminders.js');
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const fakeRequire = (name) => {
    if (name === '@react-native-async-storage/async-storage') return asyncStorage;
    if (name === 'expo-crypto') {
      return {
        randomUUID() {
          calls.push('crypto:uuid');
          if (options.cryptoThrows) throw new Error('crypto failed');
          cryptoSequence += 1;
          return `00000000-0000-4000-8000-${String(cryptoSequence).padStart(12, '0')}`;
        },
      };
    }
    if (name === './notificationAdapter') return adapter;
    if (name === './agronomyStorage') return { AGRONOMY_EVENT_TYPES: agronomyTypes };
    if (name === './observationStorage') {
      return {
        OBSERVATION_CATEGORIES: Object.keys(observationTypes),
        OBSERVATION_EVENT_TYPES_BY_CATEGORY: observationTypes,
      };
    }
    return require(name);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return {
    reminders: mod.exports,
    values,
    calls,
    scheduled,
    emit(response) { for (const handler of listeners) handler(response); },
    setInitialResponse(value) { initialResponse = value; },
    setPermission(value) { permission = value; },
    setRequestedPermission(value) { requestedPermission = value; },
    setFailSet(value) { failSet = value; },
    setFailRemove(value) { failRemove = value; },
    setCancelFailures(valuesToFail) { cancelFailures = new Set(valuesToFail); },
  };
}

function validInput(patch = {}) {
  return {
    savedId: SAVED_A,
    category: 'plant',
    actionKey: 'growth',
    nextAt: future(),
    repeat: 'once',
    title: 'Observar sua planta',
    body: 'Registre o crescimento observado.',
    ...patch,
  };
}

function responseFor(reminder, extraData = {}) {
  return {
    notification: {
      request: {
        content: {
          data: {
            type: 'specimen-reminder',
            savedId: reminder.savedId,
            reminderId: reminder.reminderId,
            ...extraData,
          },
        },
      },
    },
  };
}

test('cria canal antes da permissao e persiste somente depois do agendamento', async () => {
  const env = loadCore({ permission: { status: 'prompt', canAskAgain: true } });
  const result = await env.reminders.createLocalReminder(validInput());
  assert.equal(result.ok, true);
  assert.equal(result.status, 'scheduled');
  assert.equal(result.permissionStatus, 'granted');
  assert.match(result.reminder.reminderId, /^[0-9a-f-]{36}$/i);
  assert.equal(result.reminder.nextAt, validInput({ nextAt: result.reminder.nextAt }).nextAt);
  assert.ok(Date.parse(result.reminder.nextAt) > Date.now());

  assert.ok(env.calls.indexOf('channel') < env.calls.indexOf('permission:get'));
  assert.ok(env.calls.indexOf('permission:request') < env.calls.indexOf('schedule'));
  assert.ok(env.calls.indexOf('schedule') < env.calls.findIndex((item) => item.startsWith('storage:set:')));
  const native = env.scheduled.get(result.reminder.notificationId);
  assert.deepEqual(native.data, {
    type: 'specimen-reminder',
    savedId: SAVED_A,
    reminderId: result.reminder.reminderId,
  });
  assert.deepEqual(Object.keys(native.data).sort(), ['reminderId', 'savedId', 'type']);
});

test('valida as oito categorias e aceita somente UUID ou timestamp legado', async () => {
  const env = loadCore();
  assert.equal((await env.reminders.createLocalReminder(validInput({ category: 'fish', actionKey: 'flowering' }))).status, 'invalid');
  assert.equal((await env.reminders.createLocalReminder(validInput({ category: 'crop', actionKey: 'waterReading' }))).status, 'invalid');
  assert.equal((await env.reminders.createLocalReminder(validInput({ savedId: 'taxon:zea mays' }))).status, 'invalid');
  assert.equal((await env.reminders.createLocalReminder(validInput({ savedId: 'provider-1234567890123' }))).status, 'invalid');
  assert.equal((await env.reminders.createLocalReminder(validInput({ nextAt: new Date(Date.now() - 1000).toISOString() }))).status, 'invalid');
  assert.equal((await env.reminders.createLocalReminder(validInput({ nextAt: 'amanha' }))).status, 'invalid');
  assert.equal((await env.reminders.createLocalReminder(validInput({ repeat: 'monthly' }))).status, 'invalid');
  assert.equal(env.calls.includes('channel'), false, 'entrada invalida nao abre permissao');

  for (const [category, actionKey] of [
    ['plant', 'care'], ['tree', 'habitat'], ['insect', 'lifeStage'], ['mushroom', 'sporePrint'],
    ['fish', 'waterReading'], ['bird', 'vocalization'], ['sound', 'recording'], ['crop', 'fertilization'],
  ]) {
    const result = await env.reminders.createLocalReminder(validInput({
      savedId: category === 'plant' ? SAVED_A : SAVED_B.replace(/^2/, String((category.length % 7) + 2)),
      category,
      actionKey,
    }));
    assert.equal(result.ok, true, category);
  }
});

test('exemplar legado numerico pode criar, abrir e cancelar lembrete', async () => {
  const env = loadCore();
  const legacySavedId = '1724238000000';
  const created = await env.reminders.createLocalReminder(validInput({ savedId: legacySavedId }));
  assert.equal(created.ok, true);
  env.setInitialResponse(responseFor(created.reminder));
  assert.deepEqual(await env.reminders.getInitialReminderResponse(), {
    type: 'specimen-reminder',
    savedId: legacySavedId,
    reminderId: created.reminder.reminderId,
  });
  assert.equal(await env.reminders.getInitialReminderResponse(), null);
  const cancelled = await env.reminders.cancelRemindersForSavedId(legacySavedId);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.removed, 1);
  assert.deepEqual(await env.reminders.listLocalReminders(legacySavedId), []);
});

test('permissao negada e erro ficam distintos e nenhuma leitura pede permissao', async () => {
  const denied = loadCore({ permission: { status: 'denied', canAskAgain: false } });
  assert.deepEqual(await denied.reminders.listLocalReminders(SAVED_A), []);
  assert.equal(denied.calls.includes('permission:get'), false);
  const deniedResult = await denied.reminders.createLocalReminder(validInput());
  assert.equal(deniedResult.status, 'denied');
  assert.equal(deniedResult.permissionStatus, 'denied');
  assert.equal(denied.calls.includes('permission:request'), false);
  assert.equal(denied.calls.includes('schedule'), false);

  const error = loadCore({ permission: { status: 'error', canAskAgain: false } });
  const errorResult = await error.reminders.createLocalReminder(validInput());
  assert.equal(errorResult.status, 'error');
  assert.equal(errorResult.permissionStatus, 'error');
});

test('escritas concorrentes respeitam limite seguro e listas nao vazam mutacao', async () => {
  const env = loadCore();
  assert.equal(env.reminders.MAX_LOCAL_REMINDERS, 64);
  assert.equal(env.reminders.MAX_LOCAL_REMINDERS_PER_SAVED_ID, 12);
  const created = await Promise.all(Array.from({ length: 14 }, (_, index) => (
    env.reminders.createLocalReminder(validInput({ title: `Registro ${index}` }))
  )));
  assert.equal(created.filter((item) => item.ok).length, env.reminders.MAX_LOCAL_REMINDERS_PER_SAVED_ID);
  assert.equal(created.filter((item) => item.status === 'limit').length, 2);
  const first = await env.reminders.listLocalReminders(SAVED_A);
  assert.equal(first.length, env.reminders.MAX_LOCAL_REMINDERS_PER_SAVED_ID);
  first[0].title = 'MUTADO';
  first.push({ reminderId: 'fantasma' });
  const second = await env.reminders.listLocalReminders(SAVED_A);
  assert.equal(second.length, env.reminders.MAX_LOCAL_REMINDERS_PER_SAVED_ID);
  assert.notEqual(second[0].title, 'MUTADO');
});

test('falha de persistencia desfaz o agendamento nativo', async () => {
  const env = loadCore({ failSet: true });
  const result = await env.reminders.createLocalReminder(validInput());
  assert.equal(result.ok, false);
  assert.equal(result.status, 'error');
  assert.deepEqual(Array.from(env.scheduled.keys()), []);
  assert.ok(env.calls.some((item) => item === 'cancel:native-1'));
});

test('UUID criptografico falha fechado sem Math.random', async () => {
  const env = loadCore({ cryptoThrows: true });
  const result = await env.reminders.createLocalReminder(validInput());
  assert.equal(result.ok, false);
  assert.equal(result.status, 'error');
  assert.equal(env.calls.includes('crypto:uuid'), true);
  assert.equal(env.calls.includes('permission:get'), false);
  assert.equal(env.calls.includes('schedule'), false);
  const source = require('node:fs').readFileSync(path.join(__dirname, 'components/localReminders.js'), 'utf8');
  assert.match(source, /import \* as Crypto from 'expo-crypto'/);
  assert.doesNotMatch(source, /Math\.random|globalThis\.crypto|fallbackUuid/);
});

test('cancelamento falho mantem o registro para nova tentativa', async () => {
  const env = loadCore();
  const created = await env.reminders.createLocalReminder(validInput());
  env.setCancelFailures([created.reminder.notificationId]);
  const failed = await env.reminders.removeLocalReminder(created.reminder.reminderId);
  assert.equal(failed.ok, false);
  assert.equal((await env.reminders.listLocalReminders(SAVED_A)).length, 1);

  env.setCancelFailures([]);
  const removed = await env.reminders.cancelRemindersForSavedId(SAVED_A);
  assert.equal(removed.ok, true);
  assert.equal(removed.removed, 1);
  assert.deepEqual(await env.reminders.listLocalReminders(SAVED_A), []);
  assert.deepEqual(await env.reminders.cancelRemindersForSavedId(SAVED_A), {
    ok: true, status: 'cancelled', removed: 0,
  });
});

test('reconciliacao remove disparados, payload adulterado e orfao nativo', async () => {
  const env = loadCore();
  const first = await env.reminders.createLocalReminder(validInput({ title: 'Primeiro' }));
  const second = await env.reminders.createLocalReminder(validInput({
    savedId: SAVED_B, category: 'fish', actionKey: 'feeding', title: 'Segundo', repeat: 'daily',
  }));
  const third = await env.reminders.createLocalReminder(validInput({
    savedId: SAVED_B, category: 'fish', actionKey: 'behavior', title: 'Terceiro', repeat: 'weekly',
  }));
  env.scheduled.delete(first.reminder.notificationId);
  env.scheduled.get(second.reminder.notificationId).data.extra = 'nao permitido';
  env.scheduled.get(third.reminder.notificationId).nextAt = future(180);
  env.scheduled.set('orphan', {
    notificationId: 'orphan', nextAt: future(10),
    data: { type: 'specimen-reminder', savedId: SAVED_A, reminderId: 'orphan-id' },
  });

  const result = await env.reminders.reconcileLocalReminders();
  assert.equal(result.ok, true);
  assert.equal(result.removed, 2);
  assert.equal(result.reminders.length, 1);
  assert.equal(result.reminders[0].reminderId, third.reminder.reminderId);
  assert.equal(result.reminders[0].nextAt, env.scheduled.get(third.reminder.notificationId).nextAt);
  assert.equal(env.scheduled.has(second.reminder.notificationId), false);
  assert.equal(env.scheduled.has('orphan'), false);
});

test('clear cancela somente notificacoes NatureLens e falha fechado', async () => {
  const env = loadCore();
  const created = await env.reminders.createLocalReminder(validInput());
  env.scheduled.set('other-app-feature', {
    notificationId: 'other-app-feature', nextAt: future(), data: { type: 'monthly-recap' },
  });
  env.scheduled.set('naturelens-orphan', {
    notificationId: 'naturelens-orphan', nextAt: future(),
    data: { type: 'specimen-reminder', savedId: SAVED_B, reminderId: 'orphan' },
  });
  env.setCancelFailures([created.reminder.notificationId]);
  const failed = await env.reminders.clearLocalReminders();
  assert.equal(failed.ok, false);
  assert.equal((await env.reminders.listLocalReminders()).length, 1);

  env.setCancelFailures([]);
  const cleared = await env.reminders.clearLocalReminders();
  assert.equal(cleared.ok, true);
  assert.deepEqual(await env.reminders.listLocalReminders(), []);
  assert.equal(env.scheduled.has('other-app-feature'), true);
  assert.equal(env.scheduled.has('naturelens-orphan'), false);
});

test('deep link entrega payload estrito mesmo depois do disparo once', async () => {
  const env = loadCore();
  const created = await env.reminders.createLocalReminder(validInput());
  env.setInitialResponse(responseFor(created.reminder));
  assert.deepEqual(await env.reminders.getInitialReminderResponse(), {
    type: 'specimen-reminder', savedId: SAVED_A, reminderId: created.reminder.reminderId,
  });
  assert.equal(await env.reminders.getInitialReminderResponse(), null);
  env.setInitialResponse(responseFor(created.reminder, { extra: true }));
  assert.equal(await env.reminders.getInitialReminderResponse(), null);

  const received = [];
  const subscription = env.reminders.subscribeReminderResponses((payload) => received.push(payload));
  env.emit(responseFor(created.reminder));
  env.emit(responseFor(created.reminder, { extra: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(received.length, 1);
  assert.equal(received[0].savedId, SAVED_A);
  subscription.remove();
  env.emit(responseFor(created.reminder));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(received.length, 1);
});

test('deep link falha fechado quando o Expo nao confirma consumo one-shot', async () => {
  const env = loadCore({ clearResponseThrows: true });
  const created = await env.reminders.createLocalReminder(validInput());
  env.setInitialResponse(responseFor(created.reminder));
  assert.equal(await env.reminders.getInitialReminderResponse(), null);
  assert.equal(env.calls.includes('response:clear'), true);
});

test('web e storage corrompido falham fechados sem pedir permissao', async () => {
  const web = loadCore({ available: false });
  assert.equal(web.reminders.isNativeReminderAvailable(), false);
  assert.equal((await web.reminders.createLocalReminder(validInput())).status, 'unsupported');
  assert.deepEqual(await web.reminders.listLocalReminders(), []);
  assert.equal(web.calls.includes('channel'), false);
  assert.equal(web.calls.includes('permission:get'), false);

  const corrupt = loadCore({ seed: { '@naturelens_local_reminders_v1': '{quebrado' } });
  assert.deepEqual(await corrupt.reminders.listLocalReminders(), []);
  const result = await corrupt.reminders.createLocalReminder(validInput());
  assert.equal(result.status, 'error');
  assert.equal(corrupt.calls.includes('schedule'), false);
});

function loadNativeAdapter(platform = 'android') {
  const calls = [];
  let sequence = 0;
  const notificationApi = {
    SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly' },
    AndroidImportance: { DEFAULT: 3, HIGH: 4 },
    setNotificationHandler(handler) { calls.push({ kind: 'handler', handler }); },
    async setNotificationChannelAsync(id, config) { calls.push({ kind: 'channel', id, config }); },
    async getPermissionsAsync() { return { status: 'granted', granted: true }; },
    async requestPermissionsAsync() { return { status: 'granted', granted: true }; },
    async getNextTriggerDateAsync(trigger) { calls.push({ kind: 'next', trigger }); return Date.now() + 3600000; },
    async scheduleNotificationAsync(request) { sequence += 1; calls.push({ kind: 'schedule', request }); return `id-${sequence}`; },
    async cancelScheduledNotificationAsync(id) { calls.push({ kind: 'cancel', id }); },
    async getAllScheduledNotificationsAsync() { return []; },
    async getLastNotificationResponseAsync() { return null; },
    async clearLastNotificationResponseAsync() { calls.push({ kind: 'response-clear' }); },
    addNotificationResponseReceivedListener() { return { remove() {} }; },
  };
  const file = path.join(__dirname, 'components/notificationAdapter.native.js');
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const fakeRequire = (name) => {
    if (name === 'expo-notifications') return notificationApi;
    if (name === 'react-native') return { Platform: { OS: platform } };
    return require(name);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, fakeRequire);
  return { adapter: mod.exports, calls };
}

test('adapter Android usa DATE, DAILY e WEEKLY sem solicitar exact alarm', async () => {
  const { adapter, calls } = loadNativeAdapter();
  assert.equal(adapter.isNotificationAdapterAvailable(), true);
  assert.equal(adapter.LOCAL_REMINDER_CHANNEL_ID, 'naturelens-reminders-v1');
  const handler = calls.find((item) => item.kind === 'handler').handler;
  assert.deepEqual(await handler.handleNotification(), {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  });
  await adapter.ensureReminderChannel();
  const channel = calls.find((item) => item.kind === 'channel');
  assert.equal(channel.id, 'naturelens-reminders-v1');
  assert.equal(channel.config.importance, 4);
  assert.equal(channel.config.sound, 'default');
  assert.equal(await adapter.clearLastReminderResponse(), true);
  assert.equal(calls.some((item) => item.kind === 'response-clear'), true);
  for (const repeat of ['once', 'daily', 'weekly']) {
    await adapter.scheduleReminderNotification({
      title: 'NatureLens', body: 'Observe', nextAt: future(), repeat,
      data: { type: 'specimen-reminder', savedId: SAVED_A, reminderId: repeat },
    });
  }
  await assert.rejects(() => adapter.scheduleReminderNotification({
    title: 'NatureLens', body: 'Observe', nextAt: future(30 * 24 * 60), repeat: 'daily',
    data: { type: 'specimen-reminder', savedId: SAVED_A, reminderId: 'mismatch' },
  }), /first-trigger-mismatch/);
  const triggers = calls.filter((item) => item.kind === 'schedule').map((item) => item.request.trigger);
  assert.deepEqual(triggers.map((trigger) => trigger.type), ['date', 'daily', 'weekly']);
  assert.equal(triggers[0].date instanceof Date, true);
  assert.equal(triggers[1].channelId, adapter.LOCAL_REMINDER_CHANNEL_ID);
  assert.equal(triggers[2].weekday >= 1 && triggers[2].weekday <= 7, true);
  for (const trigger of triggers) {
    assert.equal(Object.hasOwn(trigger, 'exact'), false);
    assert.equal(Object.hasOwn(trigger, 'seconds'), false);
  }
  const app = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, 'app.json'), 'utf8')).expo;
  const notificationsPlugin = app.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-notifications');
  assert.equal(notificationsPlugin[1].defaultChannel, adapter.LOCAL_REMINDER_CHANNEL_ID);
  const source = require('node:fs').readFileSync(path.join(__dirname, 'components/notificationAdapter.native.js'), 'utf8');
  assert.doesNotMatch(source, /SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM/);
});

test('adapter web nunca acessa API de notificacao do navegador', async () => {
  const file = path.join(__dirname, 'components/notificationAdapter.web.js');
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  assert.equal(mod.exports.isNotificationAdapterAvailable(), false);
  assert.equal((await mod.exports.getReminderPermissionStatus()).status, 'unsupported');
  assert.equal(await mod.exports.clearLastReminderResponse(), false);
  assert.deepEqual(await mod.exports.getScheduledReminderNotifications(), []);
  await assert.rejects(() => mod.exports.scheduleReminderNotification(), /unavailable/);
});
