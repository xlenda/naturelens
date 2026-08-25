const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

test('toque no lembrete abre somente o exemplar local confirmado', () => {
  const app = read('App.js');
  assert.match(app, /getInitialReminderResponse/);
  assert.match(app, /subscribeReminderResponses/);
  assert.match(app, /target\?\.type !== 'specimen-reminder'/);
  assert.match(app, /await getCollectionEntry\(target\.savedId\)/);
  assert.match(app, /navigate\('Collection', entry[\s\S]{0,160}screen: 'Specimen'[\s\S]{0,100}savedId: target\.savedId/);
  assert.match(app, /screen: 'CollectionHome'/, 'registro removido precisa cair na colecao');
  assert.doesNotMatch(app, /linking=\{|Linking\.openURL\(target/, 'payload local nunca vira URL arbitraria');
});

test('resposta antiga e consumida e reconciliacao acontece depois do cold start', () => {
  const app = read('App.js');
  const core = read('components/localReminders.js');
  const adapter = read('components/notificationAdapter.native.js');
  assert.match(core, /consumeResponse/);
  assert.match(core, /clearLastReminderResponse\(\)/);
  assert.match(adapter, /clearLastNotificationResponseAsync/);
  assert.match(app, /getInitialReminderResponse\(\)[\s\S]{0,300}reconcileLocalReminders\(\)/);
});

test('remocao cancela lembretes antes de apagar o exemplar ou os dados pessoais', () => {
  const storage = read('components/storage.js');
  const removeStart = storage.indexOf('export function removeFromCollection');
  const cancelOne = storage.indexOf('cancelLocalRemindersForEntry(savedId)', removeStart);
  const collectionWrite = storage.indexOf('AsyncStorage.setItem(COLLECTION_KEY', cancelOne);
  assert.ok(removeStart >= 0 && cancelOne > removeStart && collectionWrite > cancelOne);

  const clearStart = storage.indexOf('export function clearCollection');
  const cancelAll = storage.indexOf('cancelAllLocalReminders()', clearStart);
  const collectionClear = storage.indexOf('AsyncStorage.removeItem(COLLECTION_KEY)', cancelAll);
  assert.ok(clearStart >= 0 && cancelAll > clearStart && collectionClear > cancelAll);
  assert.match(storage, /if \(!await cancelAllLocalReminders\(\)\) return false/);

  const settings = read('screens/SettingsScreen.js');
  const reminderClear = settings.indexOf('await clearLocalReminders()');
  const accountDelete = settings.indexOf('await deleteAccount()', reminderClear);
  assert.ok(reminderClear >= 0 && accountDelete > reminderClear, 'account deletion cancels native alarms first');
  assert.match(settings, /if \(!await clearCollection\(\)\) throw/);
});
