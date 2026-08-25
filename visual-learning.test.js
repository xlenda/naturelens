// Guarda a diagramacao didatica: conteudo profundo precisa ser exploravel por
// toque sem transformar conselho geral em dado especifico da especie.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

test('o manual usa etapas expansíveis e checklist tocável com progresso real', () => {
  const source = read('screens/CareTopicsScreen.js');

  assert.match(source, /openLessonByTopic/);
  assert.match(source, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(source, /lessonProgressSegment/);
  assert.match(source, /checkedCount\('manual', manual\.checklist\)/);
  assert.match(source, /accessibilityRole="checkbox"/);
  assert.match(source, /accessibilityState=\{\{ checked \}\}/);
  assert.match(source, /manual\.advice\.map/);
  assert.match(source, /manual\.checklist\.map/);
  assert.doesNotMatch(source, /localStorage|AsyncStorage|updateCollectionEntry/);
});

test('a capa visual identifica o topico sem fingir que a arte e da especie', () => {
  const source = read('screens/CareTopicsScreen.js');

  assert.match(source, /UNIVERSAL_MANUAL_CATEGORIES\.has\(category\) && !!meta\.art/);
  assert.match(source, /styles\.artLabel/);
  assert.match(source, /active\.label/);
  assert.match(source, /meta\.icon \|\| 'leaf'/);
});

test('a tela didatica continua compilando para Expo', () => {
  const result = babel.transformFileSync(
    path.join(__dirname, 'screens/CareTopicsScreen.js'),
    { presets: ['babel-preset-expo'] }
  );
  assert.ok(result.code.length > 1000);
});

test('a lavoura anuncia os modulos exatos e permite saltar para as tabelas', () => {
  const source = read('screens/CropDetailScreen.js');

  assert.match(source, /const showFertilizerPlanner = groupKey === 'grainCrop' \|\| groupKey === 'vegCrop'/);
  assert.match(source, /const hasAgronomyModules = hasPestManagement \|\| showFertilizerPlanner/);
  assert.match(source, /openAgronomyModule\('fertilizer'\)/);
  assert.match(source, /openAgronomyModule\('pests'\)/);
  assert.match(source, /accessibilityLabel=\{t\('fertilizer\.title'\)\}/);
  assert.match(source, /accessibilityLabel=\{t\('detail\.integratedManagementSection'\)\}/);
  assert.match(source, /getInnerViewNode\?\.\(\) \|\| scrollRef\.current/);
  assert.match(source, /showFertilizerPlanner &&[\s\S]+<FertilizerTablesCard/);
  assert.match(source, /showPlannerFallback/);
  assert.match(source, /hasPestManagement &&[\s\S]+<PestManagementTablesCard/);
});
