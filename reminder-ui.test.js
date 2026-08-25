const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const root = __dirname;
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const LOCALES = Object.freeze([
  'ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it',
  'ko', 'nl', 'pl', 'pt', 'sv', 'tr', 'zh', 'zh-hant',
]);

function flatten(value, prefix = '', output = {}) {
  for (const [key, child] of Object.entries(value || {})) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, next, output);
    else output[next] = child;
  }
  return output;
}

function placeholders(value) {
  return String(value).match(/{{[a-zA-Z0-9_]+}}/g)?.sort() || [];
}

test('Meu Registro coloca o card Android entre a linha do tempo e o workspace', () => {
  const specimen = read('screens/SpecimenScreen.js');
  assert.match(specimen, /import ReminderManager from '\.\.\/components\/ReminderManager'/);
  assert.match(specimen, /<ReminderManager entry=\{entry\} accent=\{accent\} t=\{t\} i18n=\{i18n\} \/>/);

  const timeline = specimen.indexOf('{timeline.length > 0 && (');
  const reminders = specimen.indexOf('<ReminderManager');
  const workspace = specimen.indexOf('{!!advancedWorkspace.key && (');
  assert.ok(timeline >= 0 && reminders > timeline && workspace > reminders);
});

test('interface nao renderiza fora do Android e usa somente o contrato local', () => {
  const source = read('components/ReminderManager.js');
  assert.match(source, /const isAndroid = Platform\.OS === 'android'/);
  assert.match(source, /if \(!isAndroid \|\| !entry\?\.savedId \|\| !actions\.length\) return null/);
  for (const method of [
    'isNativeReminderAvailable',
    'listLocalReminders',
    'createLocalReminder',
    'removeLocalReminder',
  ]) assert.match(source, new RegExp(`\\b${method}\\b`), method);
  assert.doesNotMatch(source, /fetch\(|axios|api\/push|entry\.(water|care|schedule)/);
});

test('pessoa escolhe acao, horario e repeticao sem prometer um inicio falso', () => {
  const source = read('components/ReminderManager.js');
  assert.match(source, /const DAY_OPTIONS = Object\.freeze\(\[1, 3, 7, 14, 30\]\)/);
  assert.match(source, /const HOUR_OPTIONS = Object\.freeze\(\[8, 12, 18, 20\]\)/);
  assert.match(source, /const REPEAT_OPTIONS = Object\.freeze\(\['once', 'daily', 'weekly'\]\)/);
  assert.match(source, /const WEEKDAY_OPTIONS = Object\.freeze\(\['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'\]\)/);
  assert.match(source, /getObservationWorkspaceConfig\(category\)/);
  assert.match(source, /agronomyWorkspace\.eventTypes\.\$\{key\}/);
  assert.match(source, /t\(item\.labelKey\)/);
  assert.match(source, /actionKey,\s*nextAt: nextAt\.toISOString\(\),\s*repeat,/);
  assert.match(source, /if \(repeat === 'daily'\) return nextDailyDate\(hour\)/);
  assert.match(source, /if \(repeat === 'weekly'\) return nextWeeklyDate\(weekday, hour\)/);
  assert.match(source, /\{repeat === 'once' && \([\s\S]+options=\{intervalOptions\}/);
  assert.match(source, /\{repeat === 'weekly' && \([\s\S]+options=\{weekdayOptions\}/);
  assert.match(source, /localReminders\.firstAt/);
});

test('sucesso aparece apenas apos o core confirmar e a leitura provar persistencia', () => {
  const source = read('components/ReminderManager.js');
  const create = source.indexOf('await createLocalReminder({');
  const confirmed = source.indexOf('if (result?.ok && result.reminder)', create);
  const readBack = source.indexOf('await listLocalReminders(entry.savedId)', confirmed);
  const persisted = source.indexOf('const persisted =', readBack);
  const success = source.indexOf("tone: 'success'", persisted);
  assert.ok(create >= 0 && confirmed > create && readBack > confirmed && persisted > readBack && success > persisted);
  assert.match(source, /formatDate\(persisted\.nextAt, i18n\.language\)/);
  assert.match(source, /result\?\.status === 'denied'/);
  assert.match(source, /result\?\.status === 'unsupported'/);
  assert.match(source, /if \(!result\?\.ok\)/);
});

test('modal e controles preservam rolagem, acessibilidade e alvos de toque', () => {
  const source = read('components/ReminderManager.js');
  assert.match(source, /<ScrollView[\s\S]+accessibilityViewIsModal=\{true\}[\s\S]+onAccessibilityEscape=\{closeModal\}/);
  assert.match(source, /accessibilityRole="radio"/);
  assert.match(source, /accessibilityState=\{\{ checked: active, disabled \}\}/);
  assert.match(source, /accessibilityState=\{\{ busy, disabled: busy \|\| !actionKey \}\}/);
  assert.match(source, /minHeight: control\.minTouch/);
  assert.match(source, /width: control\.minTouch,\s*height: control\.minTouch/);
});

test('os 17 idiomas tem o mesmo namespace e preservam placeholders', () => {
  const english = JSON.parse(read('public/locales/en.json')).localReminders;
  const reference = flatten(english);
  const keys = Object.keys(reference).sort();
  assert.ok(keys.length >= 35);

  for (const locale of LOCALES) {
    const namespace = JSON.parse(read(`public/locales/${locale}.json`)).localReminders;
    assert.ok(namespace, `${locale}: namespace ausente`);
    const flat = flatten(namespace);
    assert.deepEqual(Object.keys(flat).sort(), keys, `${locale}: chaves divergentes`);
    for (const key of keys) {
      assert.equal(typeof flat[key], 'string', `${locale}.${key}: texto ausente`);
      assert.ok(flat[key].trim().length > 0, `${locale}.${key}: texto vazio`);
      assert.deepEqual(
        placeholders(flat[key]),
        placeholders(reference[key]),
        `${locale}.${key}: placeholders divergentes`,
      );
    }
    if (locale !== 'en') {
      assert.notEqual(flat.title, reference.title, `${locale}: titulo caiu para ingles`);
      assert.notEqual(flat.saveAction, reference.saveAction, `${locale}: CTA caiu para ingles`);
    }
  }
});

test('arquivos JSX compilam para o build Android', () => {
  for (const file of ['components/ReminderManager.js', 'screens/SpecimenScreen.js']) {
    assert.doesNotThrow(() => babel.transformFileSync(path.join(root, file), {
      presets: ['babel-preset-expo'],
    }), file);
  }
});
